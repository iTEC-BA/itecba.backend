// src/modules/points/points.service.js
// Función centralizada de otorgamiento de puntos.
// Cualquier controlador la importa y llama con una sola línea.
// NUNCA lanza excepciones al llamante — falla silenciosamente.
import admin       from "firebase-admin";
import Activity    from "./activity.model.js";
import PointLog    from "./pointLog.model.js";
import { DEFAULT_ACTIVITIES } from "./defaultActivities.js";

// ── Inicialización: puebla la colección si está vacía ────────────────────────
export const seedActivitiesIfEmpty = async () => {
  try {
    const count = await Activity.countDocuments();
    if (count > 0) return;
    await Activity.insertMany(DEFAULT_ACTIVITIES);
    console.log("🟢 [Points] Actividades por defecto cargadas en MongoDB.");
  } catch (err) {
    console.error("🔴 [Points] Error al cargar actividades por defecto:", err.message);
  }
};

/**
 * Otorga puntos a un usuario por una actividad dada.
 * Respeta cooldown y tope diario configurados en MongoDB.
 * Actualiza Firestore con FieldValue.increment (atómico).
 *
 * @param {string}  uid          – Firebase UID del usuario
 * @param {string}  activityKey  – Key de la actividad (ej: "forum_post")
 * @param {object}  [context]    – Datos opcionales de contexto para el log (postId, etc.)
 * @returns {{ granted: boolean, points: number, reason?: string }}
 */
export const grantPoints = async (uid, activityKey, context = {}) => {
  try {
    // ── 1. Buscar actividad en MongoDB ───────────────────────────────────────
    const activity = await Activity.findOne({ key: activityKey }).lean();

    if (!activity) {
      return { granted: false, reason: "activity_not_found" };
    }
    if (!activity.isActive) {
      return { granted: false, reason: "activity_inactive" };
    }

    const now = new Date();

    // ── 2. Verificar cooldown ────────────────────────────────────────────────
    if (activity.cooldownMinutes > 0) {
      const cooldownMs = activity.cooldownMinutes * 60 * 1000;
      const since      = new Date(now.getTime() - cooldownMs);

      const recent = await PointLog.findOne({
        uid,
        activityKey,
        createdAt: { $gte: since },
      }).lean();

      if (recent) {
        return { granted: false, reason: "cooldown" };
      }
    }

    // ── 3. Verificar tope diario ─────────────────────────────────────────────
    if (activity.dailyCap > 0) {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      const todayCount = await PointLog.countDocuments({
        uid,
        activityKey,
        createdAt: { $gte: startOfDay },
      });

      if (todayCount >= activity.dailyCap) {
        return { granted: false, reason: "daily_cap_reached" };
      }
    }

    // ── 4. Sumar puntos en Firestore (atómico) ───────────────────────────────
    const db      = admin.firestore();
    const userRef = db.collection("users").doc(uid);

    await userRef.update({
      points: admin.firestore.FieldValue.increment(activity.points),
    });

    // ── 5. Registrar en el log ───────────────────────────────────────────────
    await PointLog.create({
      uid,
      activityKey,
      pointsAwarded: activity.points,
      context,
      createdAt: now,
    });

    return { granted: true, points: activity.points };

  } catch (err) {
    // Falla silenciosamente para nunca romper el controlador llamante
    console.error(`[Points] Error al otorgar puntos (uid=${uid}, activity=${activityKey}):`, err.message);
    return { granted: false, reason: "internal_error" };
  }
};
