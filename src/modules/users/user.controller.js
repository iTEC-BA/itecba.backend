import { dbFirebase, authFirebase } from "../../config/firebase-admin.js";
import { notFound, badRequest }     from "../../middlewares/errorHandler.js";

// GET /api/users  — lista paginada de usuarios (solo admin)
export const getUsers = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    // nextPageToken permite paginación en Firebase Auth
    const pageToken  = req.query.pageToken || undefined;
    const listResult = await authFirebase.listUsers(limit, pageToken);

    // Enriquecemos con el rol desde Firestore (en paralelo, limitado a 10 por batch)
    const enriched = await Promise.all(
      listResult.users.map(async (user) => {
        const doc  = await dbFirebase.collection("users").doc(user.uid).get();
        const data = doc.exists ? doc.data() : {};
        return {
          uid:         user.uid,
          email:       user.email,
          displayName: user.displayName,
          photoURL:    user.photoURL,
          disabled:    user.disabled,
          createdAt:   user.metadata.creationTime,
          role:        data.role ?? "student",
          points:      data.points ?? 0,
        };
      })
    );

    res.status(200).json({
      users:         enriched,
      nextPageToken: listResult.pageToken ?? null,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/users/search?email=xxx  — buscar por email (admin)
export const searchUserByEmail = async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email) return next(badRequest("Parámetro email requerido"));

    const userRecord = await authFirebase.getUserByEmail(email).catch(() => null);
    if (!userRecord) return next(notFound("Usuario no encontrado"));

    const doc  = await dbFirebase.collection("users").doc(userRecord.uid).get();
    const data = doc.exists ? doc.data() : {};

    res.status(200).json({
      uid:         userRecord.uid,
      email:       userRecord.email,
      displayName: userRecord.displayName,
      photoURL:    userRecord.photoURL,
      role:        data.role ?? "student",
      points:      data.points ?? 0,
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/users/:uid/role  — cambiar rol (admin)
export const updateUserRole = async (req, res, next) => {
  try {
    const { uid }  = req.params;
    const { role } = req.body;
    const VALID_ROLES = ["student", "admin", "moderator"];

    if (!VALID_ROLES.includes(role)) {
      return next(badRequest(`Rol inválido. Debe ser: ${VALID_ROLES.join(", ")}`));
    }
    // Evitar que el admin se auto-demote accidentalmente
    if (uid === req.user.uid && role !== "admin") {
      return next(badRequest("No podés cambiar tu propio rol"));
    }

    await dbFirebase.collection("users").doc(uid).set({ role }, { merge: true });
    res.status(200).json({ uid, role, message: "Rol actualizado" });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/users/:uid/points  — sumar/restar puntos (admin)
export const updateUserPoints = async (req, res, next) => {
  try {
    const { uid }    = req.params;
    const { points } = req.body;

    const ref      = dbFirebase.collection("users").doc(uid);
    const doc      = await ref.get();
    if (!doc.exists) return next(notFound("Usuario no encontrado en Firestore"));

    const current  = doc.data().points ?? 0;
    const newTotal = Math.max(0, current + Number(points));
    await ref.set({ points: newTotal }, { merge: true });

    res.status(200).json({ uid, points: newTotal });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/users/:uid/profile  — el propio usuario actualiza su perfil extendido
export const updateUserProfile = async (req, res, next) => {
  try {
    const { uid } = req.params;

    // Un usuario solo puede editar su propio perfil (salvo admin)
    if (uid !== req.user.uid && req.user.role !== "admin") {
      return next(badRequest("Solo podés editar tu propio perfil."));
    }

    const ALLOWED = [
      "displayName", "dni", "legajo", "specialty",
      "careers", "startYear", "photoURL", "phone",
    ];
    const update = {};
    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    if (Object.keys(update).length === 0) {
      return next(badRequest("Sin datos para actualizar."));
    }

    // Actualizar Firestore (campo name/displayName)
    await dbFirebase.collection("users").doc(uid).set(update, { merge: true });

    // Sincronizar displayName en Firebase Auth si se proveyó
    if (update.displayName) {
      await authFirebase.updateUser(uid, { displayName: update.displayName });
    }

    res.status(200).json({
      uid,
      updated: Object.keys(update),
      message: "Perfil actualizado",
    });
  } catch (err) {
    next(err);
  }
};
