// ADDON: user.profile.addon.js
// Agregar esta función al user.controller.js existente y la ruta en user.routes.js
// RUTA:  PATCH /api/users/:uid/profile  (requiere verifyToken)

import { dbFirebase, authFirebase } from "../../config/firebase-admin.js";
import { badRequest } from "../../middlewares/errorHandler.js";

/**
 * Actualiza el perfil extendido del usuario en Firestore.
 * Solo el propio usuario puede actualizar su perfil (salvo admin).
 */
export const updateUserProfile = async (req, res, next) => {
  try {
    const { uid } = req.params;

    // Un usuario solo puede editar su propio perfil
    if (uid !== req.user.uid && req.user.role !== "admin") {
      return next(badRequest("Solo podés editar tu propio perfil."));
    }

    const ALLOWED = [
      "displayName", "dni", "legajo", "specialty",
      "careers", "startYear", "photoURL",
    ];
    const update = {};
    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    if (Object.keys(update).length === 0) {
      return next(badRequest("Sin datos para actualizar."));
    }

    // Actualizar Firestore
    await dbFirebase.collection("users").doc(uid).set(update, { merge: true });

    // Actualizar displayName en Firebase Auth si se proveyó
    if (update.displayName) {
      await authFirebase.updateUser(uid, { displayName: update.displayName });
    }

    res.status(200).json({ uid, updated: Object.keys(update), message: "Perfil actualizado" });
  } catch (err) {
    next(err);
  }
};

// En user.routes.js agregar:
// import { updateUserProfile } from "./user.profile.addon.js";
// router.patch("/:uid/profile", verifyToken, validate, updateUserProfile);
