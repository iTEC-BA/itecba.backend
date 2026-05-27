// src/modules/points/points.controller.js
import Activity    from "./activity.model.js";
import PointLog    from "./pointLog.model.js";
import { grantPoints } from "./points.service.js";
import { notFound, badRequest } from "../../middlewares/errorHandler.js";

// ── GET /api/points/activities — catálogo público (solo activas) ─────────────
export const getPublicActivities = async (req, res, next) => {
  try {
    const activities = await Activity
      .find({ isActive: true })
      .select("key name points cooldownMinutes dailyCap")
      .lean();
    res.status(200).json(activities);
  } catch (err) { next(err); }
};

// ── GET /api/points/activities/admin — catálogo completo (admin) ─────────────
export const getAdminActivities = async (req, res, next) => {
  try {
    const activities = await Activity
      .find({})
      .sort({ key: 1 })
      .lean();
    res.status(200).json(activities);
  } catch (err) { next(err); }
};

// ── PATCH /api/points/activities/:id — editar actividad (admin) ──────────────
export const updateActivity = async (req, res, next) => {
  try {
    const ALLOWED = ["name", "description", "points", "cooldownMinutes", "dailyCap", "isActive"];
    const update  = {};
    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (Object.keys(update).length === 0) return next(badRequest("Sin cambios."));

    const doc = await Activity.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!doc) return next(notFound("Actividad no encontrada."));

    res.status(200).json(doc);
  } catch (err) { next(err); }
};

// ── POST /api/points/grant — otorgar puntos desde el frontend (requiere auth) ─
// El UID se extrae del token Firebase, NUNCA del body.
export const grantPointsEndpoint = async (req, res, next) => {
  try {
    const uid         = req.user.uid; // siempre del token
    const { activityKey, context } = req.body;

    if (!activityKey || typeof activityKey !== "string") {
      return next(badRequest("activityKey requerido."));
    }

    const result = await grantPoints(uid, activityKey, context ?? {});
    res.status(200).json(result);
  } catch (err) { next(err); }
};

// ── GET /api/points/history — historial del usuario autenticado ──────────────
export const getHistory = async (req, res, next) => {
  try {
    const uid  = req.user.uid;
    const logs = await PointLog
      .find({ uid })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("activityKey pointsAwarded context createdAt")
      .lean();

    // Enriquecer con el nombre de la actividad
    const keys = [...new Set(logs.map((l) => l.activityKey))];
    const activities = await Activity.find({ key: { $in: keys } }).select("key name").lean();
    const nameMap = Object.fromEntries(activities.map((a) => [a.key, a.name]));

    const enriched = logs.map((l) => ({
      ...l,
      activityName: nameMap[l.activityKey] ?? l.activityKey,
    }));

    res.status(200).json(enriched);
  } catch (err) { next(err); }
};
