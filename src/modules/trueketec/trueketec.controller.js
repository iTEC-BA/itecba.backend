// src/modules/trueketec/trueketec.controller.js
import Trueketec from "./trueketec.model.js";
import { pushToUser } from "../notifications/notification.controller.js";
import { badRequest, notFound, forbidden } from "../../middlewares/errorHandler.js";

// ── Helper: dominio UTN ─────────────────────────────────────
const isUTNEmail = (email) => email?.endsWith("@frba.utn.edu.ar");

// ── Helper: detectar match cruzado ──────────────────────────
// Un match es: otra solicitud activa de la misma materia
// donde comision_actual == mi comision_deseada
// Y (comision_deseada == mi comision_actual  O comision_deseada == "Cualquiera")
const findMatches = async (post) => {
  const query = {
    _id:             { $ne: post._id },
    userId:          { $ne: post.userId },
    estado:          "activo",
    materia:         post.materia,
    comision_actual: post.comision_deseada === "Cualquiera"
      ? { $exists: true }           // acepta cualquier comision
      : post.comision_deseada,
    comision_deseada: {
      $in: [post.comision_actual, "Cualquiera"],
    },
  };
  return Trueketec.find(query).lean();
};

// ── GET /api/trueketec ──────────────────────────────────────
// Feed público (autenticado): todas las solicitudes activas
export const getFeed = async (req, res, next) => {
  try {
    if (!isUTNEmail(req.user.email)) return next(forbidden("Solo cuentas @frba.utn.edu.ar"));

    const { materia, turno_deseado, comision_actual, page = 1 } = req.query;
    const filter = { estado: "activo" };
    if (materia)          filter.materia          = { $regex: materia, $options: "i" };
    if (turno_deseado)    filter.turno_deseado    = turno_deseado;
    if (comision_actual)  filter.comision_actual  = { $regex: comision_actual, $options: "i" };

    const limit = 20;
    const skip  = (Number(page) - 1) * limit;

    const [posts, total] = await Promise.all([
      Trueketec.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Trueketec.countDocuments(filter),
    ]);

    // Para cada post, indicar si el usuario actual tiene match
    const myUid = req.user.uid;
    const myPosts = await Trueketec.find({ userId: myUid, estado: "activo" }).lean();

    const enriched = posts.map((p) => {
      const isMatch = myPosts.some(
        (mp) =>
          mp.materia === p.materia &&
          (mp.comision_actual === p.comision_deseada || p.comision_deseada === "Cualquiera") &&
          (mp.comision_deseada === p.comision_actual || mp.comision_deseada === "Cualquiera") &&
          mp._id.toString() !== p._id.toString()
      );
      // Ocultar email del autor (se revela sólo cuando hay match aceptado)
      const author = p.userId === myUid ? p.userEmail : null;
      return { ...p, isMatch, authorEmail: author };
    });

    res.json({ posts: enriched, total, page: Number(page), totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/trueketec/my-matches ────────────────────────────
// Mis matches directos: otras solicitudes que son opuestas a las mías
export const getMyMatches = async (req, res, next) => {
  try {
    if (!isUTNEmail(req.user.email)) return next(forbidden("Solo cuentas @frba.utn.edu.ar"));

    const myPosts = await Trueketec.find({ userId: req.user.uid, estado: "activo" }).lean();
    if (!myPosts.length) return res.json({ matches: [] });

    const allMatches = await Promise.all(myPosts.map((p) => findMatches(p)));
    const flat = allMatches.flatMap((matches, idx) =>
      matches.map((m) => ({
        ...m,
        // Revelar email sólo si hay match mutuo aceptado
        authorEmail: m.matchedWith === req.user.uid ? m.userEmail : null,
        myPostId: myPosts[idx]._id,
      }))
    );

    // Deduplicar
    const seen = new Set();
    const unique = flat.filter((m) => {
      const key = m._id.toString();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json({ matches: unique });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/trueketec ──────────────────────────────────────
export const createPost = async (req, res, next) => {
  try {
    if (!isUTNEmail(req.user.email)) return next(forbidden("Solo cuentas @frba.utn.edu.ar"));

    const { materia, comision_actual, turno_actual, comision_deseada, turno_deseado } = req.body;
    if (!materia || !comision_actual || !turno_actual || !comision_deseada || !turno_deseado) {
      return next(badRequest("Todos los campos son obligatorios."));
    }

    // Límite: 3 solicitudes activas por usuario
    const active = await Trueketec.countDocuments({ userId: req.user.uid, estado: "activo" });
    if (active >= 3) return next(badRequest("Límite de 3 solicitudes activas alcanzado."));

    // Expiración: 21 días desde ahora (3 semanas ≈ período de cambios)
    const expiresAt = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);

    const post = await Trueketec.create({
      userId: req.user.uid,
      userEmail: req.user.email,
      materia,
      comision_actual,
      turno_actual,
      comision_deseada,
      turno_deseado,
      expiresAt,
    });

    // ── Detectar matches y notificar ──────────────────────
    const matches = await findMatches(post);
    if (matches.length > 0) {
      // Notificar al propio usuario: tiene matches inmediatos
      await pushToUser(req.user.uid, {
        title: "🤝 ¡TruekeTEC! Hay matches para tu publicación",
        body: `Encontramos ${matches.length} intercambio(s) posible(s) para ${materia}.`,
        url: "/trueketec",
        source: "trueketec",
      });
      // Notificar a cada usuario con match
      for (const m of matches) {
        await pushToUser(m.userId, {
          title: "🔔 Nuevo match en TruekeTEC",
          body: `Alguien busca intercambiar ${materia} con tu comisión.`,
          url: "/trueketec",
          source: "trueketec",
        });
      }
    }

    res.status(201).json(post);
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/trueketec/:id ────────────────────────────────
export const deletePost = async (req, res, next) => {
  try {
    const post = await Trueketec.findById(req.params.id);
    if (!post) return next(notFound("Solicitud no encontrada."));
    if (post.userId !== req.user.uid && req.user.role !== "admin") {
      return next(forbidden("No tenés permiso para eliminar esta solicitud."));
    }
    await post.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/trueketec/:id/accept-match ────────────────────
// Acepta un match: revela email de ambas partes
export const acceptMatch = async (req, res, next) => {
  try {
    if (!isUTNEmail(req.user.email)) return next(forbidden("Solo cuentas @frba.utn.edu.ar"));

    const { targetPostId } = req.body; // ID del post del otro usuario
    const myPost     = await Trueketec.findById(req.params.id);
    const theirPost  = await Trueketec.findById(targetPostId);

    if (!myPost || !theirPost)        return next(notFound("Solicitud no encontrada."));
    if (myPost.userId !== req.user.uid) return next(forbidden("No es tu solicitud."));

    // Cruzar y confirmar
    myPost.matchedWith  = theirPost.userId;
    myPost.matchedEmail = theirPost.userEmail;
    myPost.estado       = "completado";
    await myPost.save();

    theirPost.matchedWith  = myPost.userId;
    theirPost.matchedEmail = myPost.userEmail;
    theirPost.estado       = "completado";
    await theirPost.save();

    // Notificar a ambas partes
    await pushToUser(theirPost.userId, {
      title: "✅ ¡Match confirmado en TruekeTEC!",
      body:  `Tu intercambio de ${myPost.materia} fue aceptado. Contactate con ${myPost.userEmail}`,
      url:   "/trueketec",
      source: "trueketec",
    });

    res.json({
      ok: true,
      theirEmail: theirPost.userEmail,
    });
  } catch (err) {
    next(err);
  }
};

// ── ADMIN: GET /api/trueketec/admin ─────────────────────────
export const adminGetAll = async (req, res, next) => {
  try {
    const { estado, page = 1 } = req.query;
    const filter = estado ? { estado } : {};
    const limit  = 50;
    const skip   = (Number(page) - 1) * limit;
    const [posts, total] = await Promise.all([
      Trueketec.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Trueketec.countDocuments(filter),
    ]);
    res.json({ posts, total, page: Number(page) });
  } catch (err) {
    next(err);
  }
};

// ── ADMIN: DELETE /api/trueketec/admin/:id ──────────────────
export const adminDeletePost = async (req, res, next) => {
  try {
    const post = await Trueketec.findByIdAndDelete(req.params.id);
    if (!post) return next(notFound("Solicitud no encontrada."));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// ── ADMIN: CRON — Limpiar solicitudes expiradas (llamar desde index.js con setInterval) ──
export const cleanExpiredPosts = async () => {
  try {
    // El TTL de Mongoose ya lo maneja automáticamente via expiresAt,
    // pero este helper sirve para limpieza manual o cambio de fecha de expiración.
    const result = await Trueketec.deleteMany({
      expiresAt: { $lt: new Date() },
    });
    console.log(`[TRUEKETEC] Solicitudes expiradas eliminadas: ${result.deletedCount}`);
  } catch (err) {
    console.error("[TRUEKETEC] Error en limpieza:", err.message);
  }
};
