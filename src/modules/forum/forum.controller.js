// src/modules/forum/forum.controller.js
// Foro Anónimo — Lógica de negocio
import crypto from "crypto";
import webpush from "web-push";
import { turso } from "../../config/turso.js";
import { badRequest, notFound } from "../../middlewares/errorHandler.js";

// ── VAPID Setup ──────────────────────────────────────────────────────────────
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || "mailto:admin@itecba.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

// ── Pseudónimos deterministas ─────────────────────────────────────────────────
const ADJECTIVES = [
  "Valiente",
  "Curioso",
  "Brillante",
  "Furioso",
  "Sereno",
  "Audaz",
  "Veloz",
  "Sabio",
  "Astuto",
  "Tenaz",
  "Ágil",
  "Firme",
  "Perspicaz",
  "Osado",
  "Prudente",
  "Ingenioso",
  "Reflexivo",
  "Agudo",
  "Directo",
  "Lúcido",
];
const NOUNS = [
  "Panda",
  "Águila",
  "Tigre",
  "Lobo",
  "Zorro",
  "Oso",
  "Halcón",
  "Lince",
  "Búho",
  "Cóndor",
  "Jaguar",
  "Pantera",
  "Delfín",
  "Cuervo",
  "Mapache",
  "Nutria",
  "Alce",
  "Castor",
  "Coyote",
  "Murciélago",
];

/**
 * Genera un pseudónimo determinista: "AdjetivoNombre#XXXX"
 * @param {string} uid  — Firebase UID
 */
const generatePseudonym = (uid) => {
  const salt = process.env.FORUM_SALT || "itecba-forum-salt-v1";
  const digest = crypto
    .createHash("sha256")
    .update(uid + salt)
    .digest("hex");
  const numAdj = parseInt(digest.slice(0, 4), 16) % ADJECTIVES.length;
  const numNoun = parseInt(digest.slice(4, 8), 16) % NOUNS.length;
  const suffix = digest.slice(8, 12).toUpperCase();
  return `${ADJECTIVES[numAdj]}${NOUNS[numNoun]}#${suffix}`;
};

/**
 * Hash opaco del UID para almacenar sin exponer identidad real.
 * Usado para: vincular voto/notif sin revelar quién publicó.
 */
const hashUid = (uid) => {
  const salt = process.env.FORUM_SALT || "itecba-forum-salt-v1";
  return crypto
    .createHash("sha256")
    .update(uid + salt + "hash")
    .digest("hex")
    .slice(0, 32);
};

// ── Filtro de malas palabras (español + lunfardo) ────────────────────────────
const BAD_WORDS = [
  "pelotudo",
  "pelotuda",
  "boludo",
  "boluda",
  "forro",
  "forra",
  "idiota",
  "imbecil",
  "imbécil",
  "estupido",
  "estúpido",
  "estupida",
  "estúpida",
  "tarado",
  "tarada",
  "cretino",
  "cretina",
  "inutil",
  "inútil",
  "hdp",
  "hijodeputa",
  "hijo de puta",
  "concha",
  "chota",
  "pija",
  "mierda",
  "puto",
  "puta",
  "putisima",
  "carajo",
  "gilipollas",
  "pendejo",
  "pendeja",
  "cabron",
  "cabrón",
  "coño",
  "joder",
  "polla",
  "culo",
  "imbéciles",
  "retrasado",
  "retrasada",
  "mogolico",
  "mogólico",
];

const containsBadWords = (text) => {
  const lower = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return BAD_WORDS.some((w) => {
    const normalized = w.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return lower.includes(normalized);
  });
};

// ── Helpers DB ────────────────────────────────────────────────────────────────
const EXPIRY_MONTHS = 6;
const expiresAt = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + EXPIRY_MONTHS);
  return d.toISOString().replace("T", " ").slice(0, 19);
};

const PAGE_SIZE = 20;

// ── CONTROLADORES ─────────────────────────────────────────────────────────────

/**
 * GET /api/forum/posts?page=1
 * Devuelve publicaciones raíz (sin parent) ordenadas por recientes, con
 * conteo de respuestas y votos. Si el usuario está autenticado, incluye
 * su voto previo.
 */
export const getPosts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * PAGE_SIZE;
    const userHash = req.user ? hashUid(req.user.uid) : null;

    const { rows } = await turso.execute({
      sql: `
        SELECT
          p.id,
          p.pseudonym,
          p.body,
          p.upvotes,
          p.created_at,
          (SELECT COUNT(*) FROM anonymous_posts r WHERE r.parent_id = p.id) AS reply_count
          ${userHash ? ", (SELECT value FROM post_votes WHERE user_hash = ?1 AND post_id = p.id) AS user_vote" : ", 0 AS user_vote"}
        FROM anonymous_posts p
        WHERE p.parent_id IS NULL
          AND p.expires_at > datetime('now')
        ORDER BY p.created_at DESC
        LIMIT ${PAGE_SIZE} OFFSET ${offset}
      `,
      args: userHash ? [userHash] : [],
    });

    const { rows: countRows } = await turso.execute(
      "SELECT COUNT(*) AS total FROM anonymous_posts WHERE parent_id IS NULL AND expires_at > datetime('now')",
    );

    res.status(200).json({
      posts: rows,
      total: Number(countRows[0].total),
      page,
      pageSize: PAGE_SIZE,
      hasMore: offset + rows.length < Number(countRows[0].total),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/forum/posts/:id
 * Devuelve un post raíz con todas sus respuestas anidadas (max 2 niveles).
 */
export const getThread = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userHash = req.user ? hashUid(req.user.uid) : null;

    const { rows: postRows } = await turso.execute({
      sql: `SELECT * FROM anonymous_posts WHERE id = ?1 AND expires_at > datetime('now')`,
      args: [id],
    });
    if (!postRows.length)
      return next(notFound("Post no encontrado o expirado"));

    const { rows: replyRows } = await turso.execute({
      sql: `
        SELECT
          r.*,
          (SELECT COUNT(*) FROM anonymous_posts rr WHERE rr.parent_id = r.id) AS reply_count
          ${userHash ? ", (SELECT value FROM post_votes WHERE user_hash = ?1 AND post_id = r.id) AS user_vote" : ", 0 AS user_vote"}
        FROM anonymous_posts r
        WHERE r.parent_id = ?${userHash ? "2" : "1"}
          AND r.expires_at > datetime('now')
        ORDER BY r.created_at ASC
      `,
      args: userHash ? [userHash, id] : [id],
    });

    res.status(200).json({ post: postRows[0], replies: replyRows });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/forum/posts
 * Crea una publicación raíz anónima.
 */
export const createPost = async (req, res, next) => {
  try {
    const { body, parent_id } = req.body;
    const { uid } = req.user; // uid en vez de email, usando la lógica del nuevo archivo

    // 1. Verificamos 'body'
    if (!body?.trim() || body.trim().length < 3) {
      return res
        .status(400)
        .json({ error: "El contenido debe tener al menos 3 caracteres." });
    }
    if (body.trim().length > 1000) {
      return res
        .status(400)
        .json({ error: "El contenido no puede superar los 1000 caracteres." });
    }

    // 2. Filtro de malas palabras usando tu función del lunfardo
    if (containsBadWords(body)) {
      return res
        .status(400)
        .json({ error: "Publicación rechazada por vocabulario inapropiado." });
    }

    // 3. Generar hash y expiración según el nuevo schema
    const pseudonym = generatePseudonym(uid);
    const userHash = hashUid(uid);
    const exp = expiresAt();

    // 4. Insertar usando los campos correctos (sin 'id' autogenerado, dejando que SQLite maneje el AUTOINCREMENT)
    const { lastInsertRowid } = await turso.execute({
      sql: `INSERT INTO anonymous_posts (parent_id, pseudonym, user_hash, body, expires_at) 
            VALUES (?, ?, ?, ?, ?)`,
      args: [parent_id || null, pseudonym, userHash, body.trim(), exp],
    });

    res.status(201).json({
      message: "Publicado con éxito",
      id: Number(lastInsertRowid),
      pseudonym,
      body: body.trim(),
      upvotes: 0,
      reply_count: 0,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/forum/posts/:id/replies
 * Crea una respuesta a un post o a otra respuesta.
 */
export const createReply = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { body } = req.body;

    if (!body?.trim() || body.trim().length < 3) {
      return next(badRequest("La respuesta debe tener al menos 3 caracteres."));
    }
    if (body.trim().length > 1000) {
      return next(
        badRequest("La respuesta no puede superar los 1000 caracteres."),
      );
    }
    if (containsBadWords(body)) {
      return next(badRequest("Tu respuesta contiene lenguaje inapropiado."));
    }

    // Verificar que el post padre existe
    const { rows: parentRows } = await turso.execute({
      sql: `SELECT id, user_hash FROM anonymous_posts WHERE id = ?1 AND expires_at > datetime('now')`,
      args: [id],
    });
    if (!parentRows.length)
      return next(notFound("Post padre no encontrado o expirado"));

    const pseudonym = generatePseudonym(req.user.uid);
    const userHash = hashUid(req.user.uid);
    const exp = expiresAt();

    const { lastInsertRowid } = await turso.execute({
      sql: `INSERT INTO anonymous_posts (parent_id, pseudonym, user_hash, body, expires_at)
            VALUES (?1, ?2, ?3, ?4, ?5)`,
      args: [id, pseudonym, userHash, body.trim(), exp],
    });

    // Web Push: notificar al autor del post padre (si no es el mismo usuario)
    const parentUserHash = parentRows[0].user_hash;
    if (parentUserHash !== userHash) {
      try {
        const { rows: subRows } = await turso.execute({
          sql: `SELECT subscription FROM push_subscriptions WHERE user_hash = ?1`,
          args: [parentUserHash],
        });
        if (subRows.length) {
          const subscription = JSON.parse(subRows[0].subscription);
          await webpush.sendNotification(
            subscription,
            JSON.stringify({
              title: "📬 iTEC Foro — Nueva respuesta",
              body: `${pseudonym} respondió a tu publicación.`,
              url: `/foro/${id}`,
            }),
          );
        }
      } catch (_e) {
        // Notificación silenciosa — no bloquear la respuesta
      }
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
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/forum/posts/:id/vote
 * Vota un post. value: 1 (upvote) | -1 (downvote). Doble click = quitar voto.
 */
export const votePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { value } = req.body;
    const userHash = hashUid(req.user.uid);

    if (![1, -1].includes(Number(value))) {
      return next(badRequest("value debe ser 1 o -1"));
    }

    // Verificar voto previo
    const { rows: prevRows } = await turso.execute({
      sql: `SELECT value FROM post_votes WHERE user_hash = ?1 AND post_id = ?2`,
      args: [userHash, id],
    });

    let delta = 0;

    if (prevRows.length) {
      const prevValue = Number(prevRows[0].value);
      if (prevValue === Number(value)) {
        // Mismo voto → quitar
        await turso.execute({
          sql: `DELETE FROM post_votes WHERE user_hash = ?1 AND post_id = ?2`,
          args: [userHash, id],
        });
        delta = -prevValue;
      } else {
        // Cambio de voto
        await turso.execute({
          sql: `UPDATE post_votes SET value = ?1 WHERE user_hash = ?2 AND post_id = ?3`,
          args: [value, userHash, id],
        });
        delta = Number(value) - prevValue;
      }
    } else {
      await turso.execute({
        sql: `INSERT INTO post_votes (user_hash, post_id, value) VALUES (?1, ?2, ?3)`,
        args: [userHash, id, value],
      });
      delta = Number(value);
    }

    await turso.execute({
      sql: `UPDATE anonymous_posts SET upvotes = upvotes + ?1 WHERE id = ?2`,
      args: [delta, id],
    });

    const { rows } = await turso.execute({
      sql: `SELECT upvotes FROM anonymous_posts WHERE id = ?1`,
      args: [id],
    });

    res.status(200).json({ upvotes: Number(rows[0]?.upvotes ?? 0) });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/forum/posts/:id
 * El autor puede eliminar su propio post (en cascada elimina respuestas).
 */
export const deletePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userHash = hashUid(req.user.uid);

    const { rows } = await turso.execute({
      sql: `SELECT user_hash FROM anonymous_posts WHERE id = ?1`,
      args: [id],
    });
    if (!rows.length) return next(notFound("Post no encontrado"));
    if (rows[0].user_hash !== userHash && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ error: true, message: "No podés eliminar este post" });
    }

    await turso.execute({
      sql: `DELETE FROM anonymous_posts WHERE id = ?1`,
      args: [id],
    });
    res.status(200).json({ message: "Post eliminado" });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/forum/push/subscribe
 * Guarda/actualiza la suscripción Web Push del usuario autenticado.
 */
export const savePushSubscription = async (req, res, next) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint)
      return next(badRequest("Suscripción inválida"));

    const userHash = hashUid(req.user.uid);
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);

    await turso.execute({
      sql: `INSERT INTO push_subscriptions (user_hash, subscription, updated_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(user_hash) DO UPDATE SET subscription = excluded.subscription, updated_at = ?3`,
      args: [userHash, JSON.stringify(subscription), now],
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/forum/push/vapid-public-key
 * Devuelve la VAPID public key para el cliente.
 */
export const getVapidPublicKey = (_req, res) => {
  res.status(200).json({ key: process.env.VAPID_PUBLIC_KEY || "" });
};
