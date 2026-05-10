// src/modules/forum/forum.controller.js
import crypto  from "crypto";
import webpush from "web-push";
import { turso }              from "../../config/turso.js";
import { badRequest, notFound } from "../../middlewares/errorHandler.js";

// ── VAPID Setup ───────────────────────────────────────────────────────────────
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || "mailto:admin@itecba.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

// ── Pseudónimos deterministas ─────────────────────────────────────────────────
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

// ── Filtro de malas palabras ──────────────────────────────────────────────────
const BAD_WORDS = [
  "pelotudo","boludo","forro","idiota","imbecil","estupido","tarado","cretino",
  "inutil","hdp","mierda","puto","puta","carajo",
];
const containsBadWords = (text) => {
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return BAD_WORDS.some((w) =>
    lower.includes(w.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
  );
};

const EXPIRY_MONTHS = 6;
const expiresAt = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + EXPIRY_MONTHS);
  return d.toISOString().replace("T", " ").slice(0, 19);
};

const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);

const PAGE_SIZE = 20;

// ═══════════════════════════════════════════════════════════════════════════════
//  POSTS — GET (feed paginado)
// ═══════════════════════════════════════════════════════════════════════════════
export const getPosts = async (req, res, next) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page)  || 1);
    const tab      = req.query.tab || "para-ti";
    const offset   = (page - 1) * PAGE_SIZE;
    const userHash = req.user ? hashUid(req.user.uid) : null;

    // Ordenamiento según tab
    const order =
      tab === "tendencias"
        ? "p.upvotes DESC, reply_count DESC, p.created_at DESC"
        : "p.created_at DESC";

    const voteSql = userHash
      ? ", (SELECT value FROM post_votes WHERE user_hash = ?1 AND post_id = p.id) AS user_vote"
      : ", 0 AS user_vote";

    const repostSql = userHash
      ? `, EXISTS(SELECT 1 FROM post_reposts WHERE user_hash = ?${userHash ? "1" : "x"} AND post_id = p.id) AS is_reposted`
      : ", 0 AS is_reposted";

    const args = userHash ? [userHash] : [];

    const { rows } = await turso.execute({
      sql: `
        SELECT p.id, p.pseudonym, p.body, p.upvotes, p.reposts, p.shares, p.views,
               p.created_at,
               (SELECT COUNT(*) FROM anonymous_posts r WHERE r.parent_id = p.id) AS reply_count
               ${voteSql}
               ${userHash
                 ? `, EXISTS(SELECT 1 FROM post_reposts WHERE user_hash = ?1 AND post_id = p.id) AS is_reposted`
                 : `, 0 AS is_reposted`}
        FROM anonymous_posts p
        WHERE p.parent_id IS NULL AND p.expires_at > datetime('now')
        ORDER BY ${order}
        LIMIT ${PAGE_SIZE} OFFSET ${offset}
      `,
      args,
    });

    const { rows: countRows } = await turso.execute(
      "SELECT COUNT(*) AS total FROM anonymous_posts WHERE parent_id IS NULL AND expires_at > datetime('now')"
    );

    res.status(200).json({
      posts:    rows,
      total:    Number(countRows[0].total),
      page,
      pageSize: PAGE_SIZE,
      hasMore:  offset + rows.length < Number(countRows[0].total),
    });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  POSTS — GET (hilo)
// ═══════════════════════════════════════════════════════════════════════════════
export const getThread = async (req, res, next) => {
  try {
    const { id }   = req.params;
    const userHash = req.user ? hashUid(req.user.uid) : null;

    // Incrementar vistas (fire-and-forget)
    turso.execute({ sql: `UPDATE anonymous_posts SET views = views + 1 WHERE id = ?1`, args: [id] })
      .catch(() => {});

    const { rows: postRows } = await turso.execute({
      sql: `SELECT * FROM anonymous_posts WHERE id = ?1 AND expires_at > datetime('now')`,
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

    res.status(200).json({ post: postRows[0], replies: replyRows });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  POSTS — POST (crear)
// ═══════════════════════════════════════════════════════════════════════════════
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
      sql: `INSERT INTO anonymous_posts (parent_id, pseudonym, user_hash, body, expires_at) VALUES (?, ?, ?, ?, ?)`,
      args: [parent_id || null, pseudonym, userHash, body.trim(), exp],
    });

    res.status(201).json({
      message: "Publicado con éxito",
      id: Number(lastInsertRowid),
      pseudonym,
      body: body.trim(),
      upvotes: 0,
      reposts: 0,
      shares: 0,
      views: 0,
      reply_count: 0,
      created_at: new Date().toISOString(),
    });
  } catch (error) { next(error); }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  REPLIES — POST (responder)
// ═══════════════════════════════════════════════════════════════════════════════
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
      sql: `SELECT id, user_hash FROM anonymous_posts WHERE id = ?1 AND expires_at > datetime('now')`,
      args: [id],
    });
    if (!parentRows.length) return next(notFound("Post padre no encontrado o expirado"));

    const pseudonym = generatePseudonym(req.user.uid);
    const userHash  = hashUid(req.user.uid);
    const exp       = expiresAt();

    const { lastInsertRowid } = await turso.execute({
      sql: `INSERT INTO anonymous_posts (parent_id, pseudonym, user_hash, body, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
      args: [id, pseudonym, userHash, body.trim(), exp],
    });

    // Web Push al autor original
    const parentUserHash = parentRows[0].user_hash;
    if (parentUserHash !== userHash) {
      try {
        const { rows: subRows } = await turso.execute({
          sql: `SELECT subscription FROM push_subscriptions WHERE user_hash = ?1`,
          args: [parentUserHash],
        });
        if (subRows.length) {
          const subscription = JSON.parse(subRows[0].subscription);
          await webpush.sendNotification(subscription, JSON.stringify({
            title: "📬 iTEC Foro",
            body:  `${pseudonym} respondió a tu publicación.`,
            url:   `/foro`,
          }));
        }
      } catch (_e) { /* Silencioso */ }
    }

    res.status(201).json({
      id: Number(lastInsertRowid),
      parent_id: Number(id),
      pseudonym,
      body: body.trim(),
      upvotes: 0,
      created_at: new Date().toISOString(),
      reply_count: 0,
    });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  VOTAR — POST
// ═══════════════════════════════════════════════════════════════════════════════
export const votePost = async (req, res, next) => {
  try {
    const { id }    = req.params;
    const { value } = req.body;
    const userHash  = hashUid(req.user.uid);

    if (![1, -1].includes(Number(value))) return next(badRequest("value debe ser 1 o -1"));

    const { rows: prevRows } = await turso.execute({
      sql:  `SELECT value FROM post_votes WHERE user_hash = ?1 AND post_id = ?2`,
      args: [userHash, id],
    });

    let delta = 0;
    if (prevRows.length) {
      const prevValue = Number(prevRows[0].value);
      if (prevValue === Number(value)) {
        await turso.execute({ sql: `DELETE FROM post_votes WHERE user_hash = ?1 AND post_id = ?2`, args: [userHash, id] });
        delta = -prevValue;
      } else {
        await turso.execute({ sql: `UPDATE post_votes SET value = ?1 WHERE user_hash = ?2 AND post_id = ?3`, args: [value, userHash, id] });
        delta = Number(value) - prevValue;
      }
    } else {
      await turso.execute({ sql: `INSERT INTO post_votes (user_hash, post_id, value) VALUES (?1, ?2, ?3)`, args: [userHash, id, value] });
      delta = Number(value);
    }

    await turso.execute({ sql: `UPDATE anonymous_posts SET upvotes = upvotes + ?1 WHERE id = ?2`, args: [delta, id] });
    const { rows } = await turso.execute({ sql: `SELECT upvotes FROM anonymous_posts WHERE id = ?1`, args: [id] });

    res.status(200).json({ upvotes: Number(rows[0]?.upvotes ?? 0) });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  REPOST — POST  ← NUEVO
// ═══════════════════════════════════════════════════════════════════════════════
export const repostPost = async (req, res, next) => {
  try {
    const { id }   = req.params;
    const userHash = hashUid(req.user.uid);

    // Verificar que el post existe
    const { rows: postRows } = await turso.execute({
      sql:  `SELECT id, reposts FROM anonymous_posts WHERE id = ?1 AND expires_at > datetime('now')`,
      args: [id],
    });
    if (!postRows.length) return next(notFound("Post no encontrado o expirado"));

    // Toggle repost
    const { rows: existing } = await turso.execute({
      sql:  `SELECT 1 FROM post_reposts WHERE user_hash = ?1 AND post_id = ?2`,
      args: [userHash, id],
    });

    let is_reposted;
    if (existing.length) {
      // Desrepostear
      await turso.execute({ sql: `DELETE FROM post_reposts WHERE user_hash = ?1 AND post_id = ?2`, args: [userHash, id] });
      await turso.execute({ sql: `UPDATE anonymous_posts SET reposts = MAX(0, reposts - 1) WHERE id = ?1`, args: [id] });
      is_reposted = false;
    } else {
      // Repostear
      await turso.execute({ sql: `INSERT INTO post_reposts (user_hash, post_id) VALUES (?1, ?2)`, args: [userHash, id] });
      await turso.execute({ sql: `UPDATE anonymous_posts SET reposts = reposts + 1 WHERE id = ?1`, args: [id] });
      is_reposted = true;
    }

    const { rows: updated } = await turso.execute({ sql: `SELECT reposts FROM anonymous_posts WHERE id = ?1`, args: [id] });
    res.status(200).json({ reposts: Number(updated[0]?.reposts ?? 0), is_reposted });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TRENDING — GET (top 50)  ← NUEVO
// ═══════════════════════════════════════════════════════════════════════════════
export const getTrending = async (req, res, next) => {
  try {
    const userHash = req.user ? hashUid(req.user.uid) : null;

    // Score = upvotes * 2 + reposts * 3 + reply_count * 1 + decay por tiempo
    // La ventana de tendencia es 7 días
    const voteSql = userHash
      ? ", (SELECT value FROM post_votes WHERE user_hash = ?1 AND post_id = p.id) AS user_vote"
      : ", 0 AS user_vote";
    const repostSql = userHash
      ? ", EXISTS(SELECT 1 FROM post_reposts WHERE user_hash = ?1 AND post_id = p.id) AS is_reposted"
      : ", 0 AS is_reposted";

    const args = userHash ? [userHash] : [];

    const { rows } = await turso.execute({
      sql: `
        SELECT p.id, p.pseudonym, p.body, p.upvotes, p.reposts, p.shares, p.views,
               p.created_at, p.expires_at,
               (SELECT COUNT(*) FROM anonymous_posts r WHERE r.parent_id = p.id) AS reply_count
               ${voteSql}
               ${repostSql},
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

    res.status(200).json({ posts: rows });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  DELETE — POST
// ═══════════════════════════════════════════════════════════════════════════════
export const deletePost = async (req, res, next) => {
  try {
    const { id }   = req.params;
    const userHash = hashUid(req.user.uid);

    const { rows } = await turso.execute({ sql: `SELECT user_hash FROM anonymous_posts WHERE id = ?1`, args: [id] });
    if (!rows.length) return next(notFound("Post no encontrado"));
    if (rows[0].user_hash !== userHash && req.user.role !== "admin")
      return res.status(403).json({ error: true, message: "No podés eliminar este post" });

    await turso.execute({ sql: `DELETE FROM anonymous_posts WHERE id = ?1`, args: [id] });
    res.status(200).json({ message: "Post eliminado" });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  BANNERS — CRUD  ← NUEVO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/forum/banners?active=1
 * Público: devuelve banners. Sin ?active filtra todos (útil para admin).
 */
export const getBanners = async (req, res, next) => {
  try {
    const onlyActive = req.query.active === "1";
    const whereSql   = onlyActive ? "WHERE is_active = 1" : "";

    const { rows } = await turso.execute(
      `SELECT id, title, description, redirect_url, svg_content, is_active, created_at, updated_at
       FROM forum_banners ${whereSql} ORDER BY id DESC`
    );
    res.status(200).json({ banners: rows });
  } catch (err) { next(err); }
};

/**
 * POST /api/forum/banners  (admin)
 */
export const createBanner = async (req, res, next) => {
  try {
    const { title, description = "", redirect_url, svg_content = "", is_active = 1 } = req.body;
    if (!title?.trim()) return next(badRequest("El título es requerido"));
    if (!redirect_url?.trim()) return next(badRequest("La URL de redirección es requerida"));

    const { lastInsertRowid } = await turso.execute({
      sql:  `INSERT INTO forum_banners (title, description, redirect_url, svg_content, is_active)
             VALUES (?1, ?2, ?3, ?4, ?5)`,
      args: [title.trim(), description.trim(), redirect_url.trim(), svg_content.trim(), is_active ? 1 : 0],
    });

    const { rows } = await turso.execute({
      sql:  `SELECT * FROM forum_banners WHERE id = ?1`,
      args: [Number(lastInsertRowid)],
    });
    res.status(201).json({ banner: rows[0] });
  } catch (err) { next(err); }
};

/**
 * PATCH /api/forum/banners/:id  (admin)
 */
export const updateBanner = async (req, res, next) => {
  try {
    const { id } = req.params;
    const fields = ["title", "description", "redirect_url", "svg_content", "is_active"];
    const sets   = [];
    const args   = [];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = ?${args.length + 1}`);
        args.push(f === "is_active" ? (req.body[f] ? 1 : 0) : req.body[f]);
      }
    }
    if (!sets.length) return next(badRequest("Sin campos para actualizar"));

    sets.push(`updated_at = ?${args.length + 1}`);
    args.push(now());
    args.push(id); // WHERE id = ?N

    await turso.execute({
      sql:  `UPDATE forum_banners SET ${sets.join(", ")} WHERE id = ?${args.length}`,
      args,
    });

    const { rows } = await turso.execute({ sql: `SELECT * FROM forum_banners WHERE id = ?1`, args: [id] });
    if (!rows.length) return next(notFound("Banner no encontrado"));

    res.status(200).json({ banner: rows[0] });
  } catch (err) { next(err); }
};

/**
 * DELETE /api/forum/banners/:id  (admin) — hard delete
 */
export const deleteBanner = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await turso.execute({ sql: `SELECT id FROM forum_banners WHERE id = ?1`, args: [id] });
    if (!rows.length) return next(notFound("Banner no encontrado"));

    await turso.execute({ sql: `DELETE FROM forum_banners WHERE id = ?1`, args: [id] });
    res.status(200).json({ message: "Banner eliminado", id: Number(id) });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PUSH NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════
export const savePushSubscription = async (req, res, next) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint) return next(badRequest("Suscripción inválida"));
    const userHash = hashUid(req.user.uid);
    const ts       = now();

    await turso.execute({
      sql:  `INSERT INTO push_subscriptions (user_hash, subscription, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(user_hash) DO UPDATE SET subscription = excluded.subscription, updated_at = ?3`,
      args: [userHash, JSON.stringify(subscription), ts],
    });
    res.status(200).json({ ok: true });
  } catch (err) { next(err); }
};

export const getVapidPublicKey = (_req, res) => {
  res.status(200).json({ key: process.env.VAPID_PUBLIC_KEY || "" });
};
