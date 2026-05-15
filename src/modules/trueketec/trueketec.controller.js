// src/modules/trueketec/trueketec.controller.js
import Trueketec from "./trueketec.model.js";
import { pushToUser } from "../notifications/notification.controller.js";
import { badRequest, notFound, forbidden } from "../../middlewares/errorHandler.js";

// ── Constantes ────────────────────────────────────────────────────────────
const PAGE_LIMIT = 16;
const MAX_ACTIVAS = 3;
const TTL_DIAS    = 21;

// ── Helpers ───────────────────────────────────────────────────────────────
const isUTNEmail   = (email)  => email?.endsWith("@frba.utn.edu.ar");
const escapeRegex  = (str)    => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const safePage     = (raw)    => Math.max(1, Math.min(9999, parseInt(raw) || 1));
const safeComision = (raw)    =>
  String(raw || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10);

/**
 * Detecta matches perfectos en DB sin traer toda la colección.
 * Recibe UN post y devuelve las publicaciones activas que lo cruzan:
 *   - otroPost.comision_actual  === post.comision_deseada  (o "Cualquiera" en cualquiera)
 *   - otroPost.comision_deseada === post.comision_actual   (o "Cualquiera" en cualquiera)
 *   - misma materia, distinto usuario, estado Activo
 *
 * La query se ejecuta ENTERA en el motor de MongoDB, aprovechando los índices
 * compuestos. El backend nunca trae registros innecesarios a memoria.
 */
const findPerfectMatches = (post) => {
  const filter = {
    _id:             { $ne: post._id },
    userId:          { $ne: post.userId },
    estado:          "Activo",
    materia:         post.materia,
    // Si yo busco "Cualquiera", cualquier comisión actual del otro me sirve.
    // Si busco una específica, el otro debe tener exactamente esa comisión.
    comision_actual: post.comision_deseada === "Cualquiera"
      ? { $exists: true }
      : post.comision_deseada,
    // El otro debe querer mi comisión actual o aceptar "Cualquiera".
    comision_deseada: { $in: [post.comision_actual, "Cualquiera"] },
  };
  return Trueketec.find(filter).select("_id userId userEmail userName materia comision_actual comision_deseada turno_actual turno_deseado").lean();
};

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/trueketec
// Feed público de publicaciones Activas, con flag isPerfectMatch por ítem.
// Query params: materia, departamento, turno_deseado, comision_actual, page
// Lógica de filtro restrictiva:
//   - Si viene `comision` (≥ 2 chars): busca por comisión directamente.
//   - Si no: requiere al menos materia O departamento.
// ═══════════════════════════════════════════════════════════════════════════
export const getFeed = async (req, res, next) => {
  try {
    if (!isUTNEmail(req.user.email)) return next(forbidden("Solo cuentas @frba.utn.edu.ar"));

    const rawMateria     = String(req.query.materia     || "").trim().slice(0, 150);
    const rawDept        = String(req.query.departamento || "").trim().slice(0, 80);
    const rawTurno       = String(req.query.turno_deseado || "").trim();
    const rawComision    = safeComision(req.query.comision);
    const page           = safePage(req.query.page);

    // ── Construir filtro MongoDB ──────────────────────────────────────────
    const filter = { estado: "Activo" };

    const hasByComision = rawComision.length >= 2;
    const hasByFilter   = !!(rawMateria || rawDept);

    if (!hasByComision && !hasByFilter) {
      return res.status(400).json({
        error:   true,
        message: "Completá al menos Materia o Departamento, o ingresá un código de comisión (mín. 2 caracteres).",
      });
    }

    if (hasByComision) {
      // Búsqueda directa por código de comisión (ej: K1094)
      filter.$or = [
        { comision_actual:  { $regex: `^${escapeRegex(rawComision)}`, $options: "i" } },
        { comision_deseada: { $regex: `^${escapeRegex(rawComision)}`, $options: "i" } },
      ];
    } else {
      if (rawMateria)  filter.materia      = { $regex: escapeRegex(rawMateria),  $options: "i" };
      if (rawDept)     filter.departamento = { $regex: escapeRegex(rawDept),     $options: "i" };
      if (rawTurno && ["Mañana","Tarde","Noche","Cualquiera"].includes(rawTurno)) {
        filter.turno_deseado = rawTurno;
      }
    }

    const skip = (page - 1) * PAGE_LIMIT;

    // ── Dos queries en paralelo: resultados + total ───────────────────────
    const [posts, total] = await Promise.all([
      Trueketec.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(PAGE_LIMIT)
        .select("-postulaciones.userId") // Ocultar UIDs de postulantes en feed
        .lean(),
      Trueketec.countDocuments(filter),
    ]);

    // ── Mis posts activos (para calcular isPerfectMatch) ─────────────────
    const myActivePosts = await Trueketec.find({ userId: req.user.uid, estado: "Activo" })
      .select("materia comision_actual comision_deseada turno_actual turno_deseado _id")
      .lean();

    // ── Enriquecer cada post con isPerfectMatch ───────────────────────────
    const enriched = posts.map((p) => {
      const isOwn         = p.userId === req.user.uid;
      const isPerfectMatch = !isOwn && myActivePosts.some(
        (mp) =>
          mp.materia === p.materia &&
          (mp.comision_actual  === p.comision_deseada  || p.comision_deseada  === "Cualquiera" || mp.comision_deseada === "Cualquiera") &&
          (mp.comision_deseada === p.comision_actual   || mp.comision_deseada === "Cualquiera" || p.comision_deseada  === "Cualquiera")
      );
      // Ocultar email hasta que haya acuerdo
      const authorEmail = (isOwn || p.matchedWith === req.user.uid) ? p.userEmail : null;
      return {
        ...p,
        isOwn,
        isPerfectMatch,
        authorEmail,
        postulacionesCount: p.postulaciones?.length ?? 0,
        postulaciones: undefined, // No exponer en feed público
      };
    });

    res.json({
      posts:      enriched,
      total,
      page,
      totalPages: Math.ceil(total / PAGE_LIMIT) || 1,
      hasMore:    skip + posts.length < total,
    });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/trueketec/my-posts
// Mis propias publicaciones (todos los estados)
// ═══════════════════════════════════════════════════════════════════════════
export const getMyPosts = async (req, res, next) => {
  try {
    if (!isUTNEmail(req.user.email)) return next(forbidden("Solo cuentas @frba.utn.edu.ar"));
    const posts = await Trueketec.find({ userId: req.user.uid })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ posts });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/trueketec/my-matches
// Posts ajenos que forman perfect match con MIS posts activos
// ═══════════════════════════════════════════════════════════════════════════
export const getMyMatches = async (req, res, next) => {
  try {
    if (!isUTNEmail(req.user.email)) return next(forbidden("Solo cuentas @frba.utn.edu.ar"));

    const myPosts = await Trueketec.find({ userId: req.user.uid, estado: "Activo" }).lean();
    if (!myPosts.length) return res.json({ matches: [] });

    const allMatches = await Promise.all(myPosts.map((p) => findPerfectMatches(p)));

    // Deduplicar y anotar con el ID del post propio que genera el match
    const seen = new Set();
    const unique = [];
    allMatches.forEach((arr, idx) => {
      arr.forEach((m) => {
        const key = m._id.toString();
        if (!seen.has(key)) {
          seen.add(key);
          unique.push({ ...m, myPostId: myPosts[idx]._id, isPerfectMatch: true });
        }
      });
    });

    res.json({ matches: unique });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/trueketec
// Crear publicación
// ═══════════════════════════════════════════════════════════════════════════
export const createPost = async (req, res, next) => {
  try {
    if (!isUTNEmail(req.user.email)) return next(forbidden("Solo cuentas @frba.utn.edu.ar"));

    const { departamento, materia, comision_actual, turno_actual, comision_deseada, turno_deseado } = req.body;

    // Límite de 3 activas por usuario
    const active = await Trueketec.countDocuments({ userId: req.user.uid, estado: "Activo" });
    if (active >= MAX_ACTIVAS) return next(badRequest(`Límite de ${MAX_ACTIVAS} publicaciones activas alcanzado.`));

    const expiresAt = new Date(Date.now() + TTL_DIAS * 24 * 60 * 60 * 1000);

    const post = await Trueketec.create({
      userId:           req.user.uid,
      userEmail:        req.user.email,
      userName:         req.user.name || req.user.email.split("@")[0],
      departamento,
      materia,
      comision_actual,
      turno_actual,
      comision_deseada,
      turno_deseado,
      expiresAt,
    });

    // Detectar matches y notificar en background (fire & forget)
    findPerfectMatches(post).then(async (matches) => {
      if (!matches.length) return;
      await pushToUser(req.user.uid, {
        title: "🤝 ¡TruekeTEC! Hay matches para tu publicación",
        body:  `Encontramos ${matches.length} intercambio(s) posible(s) para ${materia}.`,
        url:   "/trueketec",
        source: "trueketec",
      }).catch(() => {});
      for (const m of matches) {
        await pushToUser(m.userId, {
          title: "🔔 Nuevo match en TruekeTEC",
          body:  `Alguien busca intercambiar ${materia} con tu comisión.`,
          url:   "/trueketec",
          source: "trueketec",
        }).catch(() => {});
      }
    }).catch(() => {});

    res.status(201).json(post);
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /api/trueketec/:id/estado
// El dueño cambia el estado de su publicación
// ═══════════════════════════════════════════════════════════════════════════
export const changeEstado = async (req, res, next) => {
  try {
    const { estado } = req.body;
    const VALID = ["Activo", "En Negociación", "Trueque Realizado"];
    if (!VALID.includes(estado)) return next(badRequest(`Estado inválido. Opciones: ${VALID.join(", ")}`));

    const post = await Trueketec.findById(req.params.id);
    if (!post) return next(notFound("Publicación no encontrada."));
    if (post.userId !== req.user.uid) return next(forbidden("No es tu publicación."));

    post.estado = estado;
    await post.save();
    res.json({ ok: true, estado: post.estado });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/trueketec/:id/postular
// Un usuario se postula como interesado en un trueque ajeno
// ═══════════════════════════════════════════════════════════════════════════
export const postular = async (req, res, next) => {
  try {
    if (!isUTNEmail(req.user.email)) return next(forbidden("Solo cuentas @frba.utn.edu.ar"));

    const post = await Trueketec.findById(req.params.id);
    if (!post) return next(notFound("Publicación no encontrada."));
    if (post.estado !== "Activo") return next(badRequest("Esta publicación ya no está activa."));
    if (post.userId === req.user.uid) return next(badRequest("No podés postularte a tu propia publicación."));

    const yaPostulado = post.postulaciones.some((p) => p.userId === req.user.uid);
    if (yaPostulado) return res.status(409).json({ error: true, message: "Ya te postulaste a esta publicación." });

    post.postulaciones.push({
      userId:    req.user.uid,
      userEmail: req.user.email,
      userName:  req.user.name || req.user.email.split("@")[0],
    });
    await post.save();

    // Notificar al dueño de la publicación
    await pushToUser(post.userId, {
      title: "👀 Nuevo interesado en TruekeTEC",
      body:  `Alguien se interesó en tu intercambio de ${post.materia}.`,
      url:   "/trueketec",
      source: "trueketec",
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/trueketec/:id/postulantes
// El dueño obtiene la lista de interesados + sus publicaciones activas
// ═══════════════════════════════════════════════════════════════════════════
export const getPostulantes = async (req, res, next) => {
  try {
    const post = await Trueketec.findById(req.params.id).lean();
    if (!post) return next(notFound("Publicación no encontrada."));
    if (post.userId !== req.user.uid) return next(forbidden("No es tu publicación."));

    // Para cada postulante, traer sus publicaciones activas (query nativa en DB)
    const userIds = post.postulaciones.map((p) => p.userId);
    const ofertasDePostulantes = await Trueketec.find({
      userId: { $in: userIds },
      estado: "Activo",
    }).select("userId materia departamento comision_actual turno_actual comision_deseada turno_deseado").lean();

    // Agrupar por userId
    const ofertasPorUsuario = ofertasDePostulantes.reduce((acc, o) => {
      if (!acc[o.userId]) acc[o.userId] = [];
      acc[o.userId].push(o);
      return acc;
    }, {});

    const result = post.postulaciones.map((p) => ({
      userId:    p.userId,
      userEmail: p.userEmail,
      userName:  p.userName,
      ofertas:   ofertasPorUsuario[p.userId] ?? [],
    }));

    res.json({ postulantes: result });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/trueketec/:id/accept-match
// Acepta un match: revela emails de ambas partes y marca como Trueque Realizado
// ═══════════════════════════════════════════════════════════════════════════
export const acceptMatch = async (req, res, next) => {
  try {
    if (!isUTNEmail(req.user.email)) return next(forbidden("Solo cuentas @frba.utn.edu.ar"));

    const { targetPostId } = req.body;
    const [myPost, theirPost] = await Promise.all([
      Trueketec.findById(req.params.id),
      Trueketec.findById(targetPostId),
    ]);

    if (!myPost || !theirPost) return next(notFound("Publicación no encontrada."));
    if (myPost.userId !== req.user.uid) return next(forbidden("No es tu publicación."));

    // Confirmar match cruzado
    myPost.matchedWith  = theirPost.userId;
    myPost.matchedEmail = theirPost.userEmail;
    myPost.estado       = "Trueque Realizado";

    theirPost.matchedWith  = myPost.userId;
    theirPost.matchedEmail = myPost.userEmail;
    theirPost.estado       = "Trueque Realizado";

    await Promise.all([myPost.save(), theirPost.save()]);

    // Notificar a ambas partes
    await pushToUser(theirPost.userId, {
      title: "✅ ¡Trueque confirmado en TruekeTEC!",
      body:  `Tu intercambio de ${myPost.materia} fue aceptado. Contactate con ${myPost.userEmail}`,
      url:   "/trueketec",
      source: "trueketec",
    }).catch(() => {});

    res.json({ ok: true, theirEmail: theirPost.userEmail });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/trueketec/:id
// El dueño (o admin) cambia a "Trueque Realizado" en lugar de borrar
// ═══════════════════════════════════════════════════════════════════════════
export const deletePost = async (req, res, next) => {
  try {
    const post = await Trueketec.findById(req.params.id);
    if (!post) return next(notFound("Publicación no encontrada."));
    if (post.userId !== req.user.uid && req.user.role !== "admin") {
      return next(forbidden("No tenés permiso para eliminar esta publicación."));
    }
    // Soft-delete: marcar como realizado en lugar de borrar físicamente
    post.estado = "Trueque Realizado";
    await post.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — GET /api/trueketec/admin
// ═══════════════════════════════════════════════════════════════════════════
export const adminGetAll = async (req, res, next) => {
  try {
    const rawEstado = req.query.estado;
    const VALID_ESTADOS = ["Activo", "En Negociación", "Trueque Realizado"];
    const page  = safePage(req.query.page);
    const limit = 50;
    const skip  = (page - 1) * limit;

    const filter = rawEstado && VALID_ESTADOS.includes(rawEstado) ? { estado: rawEstado } : {};

    const [posts, total] = await Promise.all([
      Trueketec.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Trueketec.countDocuments(filter),
    ]);
    res.json({ posts, total, page });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — DELETE (físico) /api/trueketec/admin/:id
// ═══════════════════════════════════════════════════════════════════════════
export const adminDeletePost = async (req, res, next) => {
  try {
    const post = await Trueketec.findByIdAndDelete(req.params.id);
    if (!post) return next(notFound("Publicación no encontrada."));
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// ═══════════════════════════════════════════════════════════════════════════
// CRON — Limpiar publicaciones expiradas (llamar desde index.js)
// ═══════════════════════════════════════════════════════════════════════════
export const cleanExpiredPosts = async () => {
  try {
    const result = await Trueketec.deleteMany({ expiresAt: { $lt: new Date() } });
    console.log(`[TRUEKETEC] Solicitudes expiradas eliminadas: ${result.deletedCount}`);
  } catch (err) {
    console.error("[TRUEKETEC] Error en limpieza:", err.message);
  }
};
