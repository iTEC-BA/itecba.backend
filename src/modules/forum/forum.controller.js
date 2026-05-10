// src/modules/forum/forum.controller.js
import crypto  from "node:crypto";
import webpush from "web-push";
import { turso } from "../../config/turso.js";
import { notFound, badRequest, forbidden } from "../../middlewares/errorHandler.js";

// ── VAPID se inicializa globalmente en notification.controller.js (initWebPush) ──
// No re-inicializar aquí para evitar duplicados.

// ════════════════════════════════════════════════════════════
// PSEUDÓNIMOS DETERMINISTAS (SHA-256 + salt)
// ════════════════════════════════════════════════════════════
const ADJECTIVES = [
  "Valiente","Curioso","Brillante","Furioso","Sereno","Audaz","Veloz","Sabio",
  "Astuto","Tenaz","Ágil","Firme","Perspicaz","Osado","Prudente","Ingenioso",
  "Reflexivo","Agudo","Directo","Lúcido",
];
const NOUNS = [
  "Panda","Águila","Tigre","Lobo","Zorro","Oso","Halcón","Lince","Búho",
  "Cóndor","Jaguar","Pantera","Delfín","Cuervo","Mapache","Nutria","Alce",
  "Castor","Coyote","Murciélago",
];

const generatePseudonym = (uid) => {
  const salt   = process.env.FORUM_SALT || "itecba-forum-salt-v1";
  const digest = crypto.createHash("sha256").update(uid + salt).digest("hex");
  const adj    = parseInt(digest.slice(0, 4), 16) % ADJECTIVES.length;
  const noun   = parseInt(digest.slice(4, 8), 16) % NOUNS.length;
  const suffix = digest.slice(8, 12).toUpperCase();
  return `${ADJECTIVES[adj]}${NOUNS[noun]}#${suffix}`;
};

const hashUid = (uid) => {
  const salt = process.env.FORUM_SALT || "itecba-forum-salt-v1";
  return crypto.createHash("sha256").update(uid + salt + "hash").digest("hex").slice(0, 32);
};

// ════════════════════════════════════════════════════════════
// FILTRO DE MALAS PALABRAS
// ════════════════════════════════════════════════════════════
const BAD_WORDS = [
  "pelotudo","boludo","forro","idiota","imbecil","estupido","tarado","cretino",
  "inutil","hdp","mierda","puto","puta","carajo","concha","culo","pija",
  "choto","reverendo",
];
const containsBadWords = (text) => {
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return BAD_WORDS.some((w) =>
    lower.includes(w.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
  );
};

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════
const EXPIRY_MONTHS = 6;
const expiresAt = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + EXPIRY_MONTHS);
  return d.toISOString().replace("T", " ").slice(0, 19);
};
const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const PAGE_SIZE = 20;

/**
 * Envía push notification a un user_hash específico (silencioso en error).
 * @param {string}  userHash  - hash del destinatario
 * @param {object}  payload   - { title, body, url }
 */
const sendPushToHash = async (userHash, payload) => {
  try {
    const { rows: subs } = await turso.execute({
      sql:  "SELECT subscription FROM push_subscriptions WHERE user_hash = ?1",
      args: [userHash],
    });
    if (!subs.length) return;
    const sub = JSON.parse(subs[0].subscription);
    await webpush.sendNotification(sub, JSON.stringify(payload));
  } catch (_) { /* Silencioso — suscripción expirada o VAPID no listo */ }
};

// ════════════════════════════════════════════════════════════
// GET /api/forum/posts?tab=para-ti&page=1
// Tabs soportados: para-ti | tendencias | materias | siguiendo
// ════════════════════════════════════════════════════════════
export const getPosts = async (req, res, next) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page) || 1);
    const tab      = req.query.tab || "para-ti";
    const offset   = (page - 1) * PAGE_SIZE;
    const userHash = req.user ? hashUid(req.user.uid) : null;

    // ── Orden según tab ───────────────────────────────────
    const order = tab === "tendencias"
      ? "p.upvotes DESC, reply_count DESC, p.created_at DESC"
      : "p.created_at DESC";

    // ── Filtro adicional para el tab "materias" ───────────
    // Muestra posts que contienen al menos un #hashtag (proxy de materia)
    const materiaFilter = tab === "materias"
      ? "AND p.body LIKE '%#%'"
      : "";

    const args = userHash ? [userHash] : [];

    const { rows } = await turso.execute({
      sql: `
        SELECT p.id, p.pseudonym, p.body, p.upvotes, p.reposts, p.shares, p.views,
               p.created_at, p.user_hash,
               (SELECT COUNT(*) FROM anonymous_posts r WHERE r.parent_id = p.id) AS reply_count
               ${userHash
                 ? `, (SELECT value FROM post_votes WHERE user_hash = ?1 AND post_id = p.id) AS user_vote,
                    EXISTS(SELECT 1 FROM post_reposts WHERE user_hash = ?1 AND post_id = p.id) AS is_reposted`
                 : `, 0 AS user_vote, 0 AS is_reposted`}
        FROM anonymous_posts p
        WHERE p.parent_id IS NULL
          AND p.expires_at > datetime('now')
          ${materiaFilter}
        ORDER BY ${order}
        LIMIT ${PAGE_SIZE} OFFSET ${offset}
      `,
      args,
    });

    const { rows: countRows } = await turso.execute({
      sql:  `SELECT COUNT(*) AS total FROM anonymous_posts
             WHERE parent_id IS NULL AND expires_at > datetime('now') ${materiaFilter}`,
      args: [],
    });

    res.status(200).json({
      posts: rows.map(({ user_hash, ...p }) => ({
        ...p,
        is_author: userHash ? user_hash === userHash : false,
      })),
      total:    Number(countRows[0].total),
      page,
      pageSize: PAGE_SIZE,
      hasMore:  offset + rows.length < Number(countRows[0].total),
    });
  } catch (err) { next(err); }
};

// ════════════════════════════════════════════════════════════
// GET /api/forum/posts/:id — Thread completo
// ════════════════════════════════════════════════════════════
export const getThread = async (req, res, next) => {
  try {
    const { id }   = req.params;
    const userHash = req.user ? hashUid(req.user.uid) : null;

    // Incrementar vistas en background (fire & forget)
    turso.execute({
      sql: "UPDATE anonymous_posts SET views = views + 1 WHERE id = ?1",
      args: [id],
    }).catch(() => {});

    const { rows: postRows } = await turso.execute({
      sql:  "SELECT * FROM anonymous_posts WHERE id = ?1 AND expires_at > datetime('now')",
      args: [id],
    });
    if (!postRows.length) return next(notFound("Post no encontrado o expirado"));

    const { rows: replyRows } = await turso.execute({
      sql: `
        SELECT r.*,
          (SELECT COUNT(*) FROM anonymous_posts rr WHERE rr.parent_id = r.id) AS reply_count
          ${userHash
            ? ", (SELECT value FROM post_votes WHERE user_hash = ?1 AND post_id = r.id) AS user_vote"
            : ", 0 AS user_vote"}
        FROM anonymous_posts r
        WHERE r.parent_id = ?${userHash ? "2" : "1"} AND r.expires_at > datetime('now')
        ORDER BY r.created_at ASC
      `,
      args: userHash ? [userHash, id] : [id],
    });

    const { user_hash: _ph, ...postClean } = postRows[0];
    res.status(200).json({
      post:    { ...postClean, is_author: userHash ? _ph === userHash : false },
      replies: replyRows.map(({ user_hash: rh, ...r }) => ({
        ...r,
        is_author: userHash ? rh === userHash : false,
      })),
    });
  } catch (err) { next(err); }
};

// ════════════════════════════════════════════════════════════
// POST /api/forum/posts — Crear publicación
// ════════════════════════════════════════════════════════════
export const createPost = async (req, res, next) => {
  try {
    const { body, parent_id } = req.body;
    const { uid } = req.user;

    if (!body?.trim() || body.trim().length < 3)
      return res.status(400).json({ error: "El contenido debe tener al menos 3 caracteres." });
    if (body.trim().length > 1000)
      return res.status(400).json({ error: "El contenido no puede superar los 1000 caracteres." });
    if (containsBadWords(body))
      return res.status(400).json({ error: "Publicación rechazada por vocabulario inapropiado." });

    const pseudonym = generatePseudonym(uid);
    const userHash  = hashUid(uid);
    const exp       = expiresAt();

    const { lastInsertRowid } = await turso.execute({
      sql:  "INSERT INTO anonymous_posts (parent_id, pseudonym, user_hash, body, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)",
      args: [parent_id || null, pseudonym, userHash, body.trim(), exp],
    });

    // ── Push al autor del post padre si es respuesta ──────
    if (parent_id) {
      try {
        const { rows: pRows } = await turso.execute({
          sql:  "SELECT user_hash FROM anonymous_posts WHERE id = ?1",
          args: [parent_id],
        });
        const pH = pRows[0]?.user_hash;
        if (pH && pH !== userHash) {
          await sendPushToHash(pH, {
            title: "📬 iTEC Foro",
            body:  `${pseudonym} respondió a tu publicación.`,
            url:   `/foro/${parent_id}`,
          });
        }
      } catch (_) { /* Silencioso */ }
    }

    res.status(201).json({
      message:     "Publicado con éxito",
      id:          Number(lastInsertRowid),
      parent_id:   parent_id || null,
      pseudonym,
      body:        body.trim(),
      upvotes:     0,
      reposts:     0,
      shares:      0,
      views:       0,
      reply_count: 0,
      created_at:  new Date().toISOString(),
      user_vote:   null,
      is_reposted: false,
    });
  } catch (err) { next(err); }
};

// ════════════════════════════════════════════════════════════
// POST /api/forum/posts/:id/replies — Responder a un post
// ════════════════════════════════════════════════════════════
export const createReply = async (req, res, next) => {
  try {
    const { id }   = req.params;
    const { body } = req.body;

    if (!body?.trim() || body.trim().length < 3)
      return next(badRequest("La respuesta debe tener al menos 3 caracteres."));
    if (body.trim().length > 1000)
      return next(badRequest("La respuesta no puede superar los 1000 caracteres."));
    if (containsBadWords(body))
      return next(badRequest("Tu respuesta contiene lenguaje inapropiado."));

    const { rows: parentRows } = await turso.execute({
      sql:  "SELECT id, user_hash FROM anonymous_posts WHERE id = ?1 AND expires_at > datetime('now')",
      args: [id],
    });
    if (!parentRows.length) return next(notFound("Post padre no encontrado o expirado"));

    const pseudonym = generatePseudonym(req.user.uid);
    const userHash  = hashUid(req.user.uid);
    const exp       = expiresAt();

    const { lastInsertRowid } = await turso.execute({
      sql:  "INSERT INTO anonymous_posts (parent_id, pseudonym, user_hash, body, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)",
      args: [id, pseudonym, userHash, body.trim(), exp],
    });

    // ── Push al autor del post original ───────────────────
    const parentHash = parentRows[0].user_hash;
    if (parentHash !== userHash) {
      await sendPushToHash(parentHash, {
        title: "📬 iTEC Foro",
        body:  `${pseudonym} respondió a tu publicación.`,
        url:   `/foro/${id}`,
      });
    }

    res.status(201).json({
      id:          Number(lastInsertRowid),
      parent_id:   Number(id),
      pseudonym,
      body:        body.trim(),
      upvotes:     0,
      reply_count: 0,
      user_vote:   null,
      is_reposted: false,
      created_at:  new Date().toISOString(),
    });
  } catch (err) { next(err); }
};

// ════════════════════════════════════════════════════════════
// POST /api/forum/posts/:id/vote — Votar (toggle)
// ════════════════════════════════════════════════════════════
export const votePost = async (req, res, next) => {
  try {
    const { id }    = req.params;
    const { value } = req.body;
    const userHash  = hashUid(req.user.uid);

    if (![1, -1].includes(Number(value))) return next(badRequest("value debe ser 1 o -1"));

    const { rows: prevRows } = await turso.execute({
      sql:  "SELECT value FROM post_votes WHERE user_hash = ?1 AND post_id = ?2",
      args: [userHash, id],
    });

    let delta = 0;
    if (prevRows.length) {
      const prevValue = Number(prevRows[0].value);
      if (prevValue === Number(value)) {
        await turso.execute({
          sql:  "DELETE FROM post_votes WHERE user_hash = ?1 AND post_id = ?2",
          args: [userHash, id],
        });
        delta = -prevValue;
      } else {
        await turso.execute({
          sql:  "UPDATE post_votes SET value = ?1 WHERE user_hash = ?2 AND post_id = ?3",
          args: [value, userHash, id],
        });
        delta = Number(value) - prevValue;
      }
    } else {
      await turso.execute({
        sql:  "INSERT INTO post_votes (user_hash, post_id, value) VALUES (?1, ?2, ?3)",
        args: [userHash, id, value],
      });
      delta = Number(value);
    }

    await turso.execute({
      sql:  "UPDATE anonymous_posts SET upvotes = upvotes + ?1 WHERE id = ?2",
      args: [delta, id],
    });
    const { rows } = await turso.execute({
      sql:  "SELECT upvotes FROM anonymous_posts WHERE id = ?1",
      args: [id],
    });

    res.status(200).json({ upvotes: Number(rows[0]?.upvotes ?? 0) });
  } catch (err) { next(err); }
};

// ════════════════════════════════════════════════════════════
// POST /api/forum/posts/:id/repost — Repostear (toggle)
// ════════════════════════════════════════════════════════════
export const repostPost = async (req, res, next) => {
  try {
    const { id }   = req.params;
    const userHash = hashUid(req.user.uid);

    const { rows: postRows } = await turso.execute({
      sql:  "SELECT id, reposts FROM anonymous_posts WHERE id = ?1 AND expires_at > datetime('now')",
      args: [id],
    });
    if (!postRows.length) return next(notFound("Post no encontrado o expirado"));

    const { rows: existing } = await turso.execute({
      sql:  "SELECT 1 FROM post_reposts WHERE user_hash = ?1 AND post_id = ?2",
      args: [userHash, id],
    });

    let is_reposted;
    if (existing.length) {
      await turso.execute({
        sql:  "DELETE FROM post_reposts WHERE user_hash = ?1 AND post_id = ?2",
        args: [userHash, id],
      });
      await turso.execute({
        sql:  "UPDATE anonymous_posts SET reposts = MAX(0, reposts - 1) WHERE id = ?1",
        args: [id],
      });
      is_reposted = false;
    } else {
      await turso.execute({
        sql:  "INSERT INTO post_reposts (user_hash, post_id) VALUES (?1, ?2)",
        args: [userHash, id],
      });
      await turso.execute({
        sql:  "UPDATE anonymous_posts SET reposts = reposts + 1 WHERE id = ?1",
        args: [id],
      });
      is_reposted = true;
    }

    const { rows: updated } = await turso.execute({
      sql:  "SELECT reposts FROM anonymous_posts WHERE id = ?1",
      args: [id],
    });
    res.status(200).json({ reposts: Number(updated[0]?.reposts ?? 0), is_reposted });
  } catch (err) { next(err); }
};

// ════════════════════════════════════════════════════════════
// GET /api/forum/trending — Top 50 por score compuesto
// Score = (upvotes * 2) + (reposts * 3) + replies - (horas_desde_post * 0.5)
// ════════════════════════════════════════════════════════════
export const getTrending = async (req, res, next) => {
  try {
    const userHash = req.user ? hashUid(req.user.uid) : null;
    const args     = userHash ? [userHash] : [];

    const { rows } = await turso.execute({
      sql: `
        SELECT p.id, p.pseudonym, p.body, p.upvotes, p.reposts, p.shares, p.views,
               p.created_at, p.expires_at,
               (SELECT COUNT(*) FROM anonymous_posts r WHERE r.parent_id = p.id) AS reply_count
               ${userHash
                 ? `, (SELECT value FROM post_votes WHERE user_hash = ?1 AND post_id = p.id) AS user_vote,
                    EXISTS(SELECT 1 FROM post_reposts WHERE user_hash = ?1 AND post_id = p.id) AS is_reposted`
                 : `, 0 AS user_vote, 0 AS is_reposted`},
               (
                 p.upvotes * 2 + p.reposts * 3 +
                 (SELECT COUNT(*) FROM anonymous_posts r WHERE r.parent_id = p.id) +
                 CAST((julianday('now') - julianday(p.created_at)) * 24 AS INTEGER) * -0.5
               ) AS trend_score
        FROM anonymous_posts p
        WHERE p.parent_id IS NULL
          AND p.expires_at > datetime('now')
          AND p.created_at > datetime('now', '-7 days')
        ORDER BY trend_score DESC
        LIMIT 50
      `,
      args,
    });

    res.status(200).json({
      posts: rows.map(({ user_hash, ...p }) => ({
        ...p,
        is_author: userHash ? user_hash === userHash : false,
      })),
    });
  } catch (err) { next(err); }
};

// ════════════════════════════════════════════════════════════
// DELETE /api/forum/posts/:id — Eliminar (autor o admin)
// ════════════════════════════════════════════════════════════
export const deletePost = async (req, res, next) => {
  try {
    const { id }   = req.params;
    const userHash = hashUid(req.user.uid);

    const { rows } = await turso.execute({
      sql:  "SELECT user_hash FROM anonymous_posts WHERE id = ?1",
      args: [id],
    });
    if (!rows.length) return next(notFound("Post no encontrado"));
    if (rows[0].user_hash !== userHash && req.user.role !== "admin")
      return next(forbidden("No podés eliminar este post"));

    await turso.execute({
      sql:  "DELETE FROM anonymous_posts WHERE id = ?1",
      args: [id],
    });
    res.status(200).json({ message: "Post eliminado" });
  } catch (err) { next(err); }
};

// ════════════════════════════════════════════════════════════
// BANNERS — CRUD  /api/forum/banners
// ════════════════════════════════════════════════════════════
export const getBanners = async (req, res, next) => {
  try {
    const onlyActive = req.query.active === "1";
    const { rows } = await turso.execute(
      `SELECT id, title, description, redirect_url, svg_content, is_active, created_at, updated_at
       FROM forum_banners ${onlyActive ? "WHERE is_active = 1" : ""} ORDER BY id DESC`
    );
    res.status(200).json({ banners: rows });
  } catch (err) { next(err); }
};

export const createBanner = async (req, res, next) => {
  try {
    const { title, description = "", redirect_url, svg_content = "", is_active = 1 } = req.body;
    if (!title?.trim())        return next(badRequest("El título es requerido"));
    if (!redirect_url?.trim()) return next(badRequest("La URL de redirección es requerida"));

    const { lastInsertRowid } = await turso.execute({
      sql:  "INSERT INTO forum_banners (title, description, redirect_url, svg_content, is_active) VALUES (?1, ?2, ?3, ?4, ?5)",
      args: [title.trim(), description.trim(), redirect_url.trim(), svg_content.trim(), is_active ? 1 : 0],
    });
    const { rows } = await turso.execute({
      sql:  "SELECT * FROM forum_banners WHERE id = ?1",
      args: [Number(lastInsertRowid)],
    });
    res.status(201).json({ banner: rows[0] });
  } catch (err) { next(err); }
};

export const updateBanner = async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = ["title", "description", "redirect_url", "svg_content", "is_active"];
    const sets = []; const args = [];

    for (const f of allowed) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = ?${args.length + 1}`);
        args.push(f === "is_active" ? (req.body[f] ? 1 : 0) : req.body[f]);
      }
    }
    if (!sets.length) return next(badRequest("Sin campos para actualizar"));

    sets.push(`updated_at = ?${args.length + 1}`);
    args.push(now());
    args.push(id);

    await turso.execute({
      sql:  `UPDATE forum_banners SET ${sets.join(", ")} WHERE id = ?${args.length}`,
      args,
    });
    const { rows } = await turso.execute({
      sql:  "SELECT * FROM forum_banners WHERE id = ?1",
      args: [id],
    });
    if (!rows.length) return next(notFound("Banner no encontrado"));
    res.status(200).json({ banner: rows[0] });
  } catch (err) { next(err); }
};

export const deleteBanner = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await turso.execute({
      sql:  "SELECT id FROM forum_banners WHERE id = ?1",
      args: [id],
    });
    if (!rows.length) return next(notFound("Banner no encontrado"));
    await turso.execute({ sql: "DELETE FROM forum_banners WHERE id = ?1", args: [id] });
    res.status(200).json({ message: "Banner eliminado", id: Number(id) });
  } catch (err) { next(err); }
};

// ════════════════════════════════════════════════════════════
// PUSH — Suscripción y VAPID Key
// ════════════════════════════════════════════════════════════
export const savePushSubscription = async (req, res, next) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint) return next(badRequest("Suscripción inválida"));
    const userHash = hashUid(req.user.uid);
    const ts       = now();

    await turso.execute({
      sql: `INSERT INTO push_subscriptions (user_hash, subscription, updated_at) VALUES (?1, ?2, ?3)
            ON CONFLICT(user_hash) DO UPDATE SET subscription = excluded.subscription, updated_at = ?3`,
      args: [userHash, JSON.stringify(subscription), ts],
    });
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
};

export const getVapidPublicKey = (_req, res) =>
  res.status(200).json({ key: process.env.VAPID_PUBLIC_KEY || "" });
