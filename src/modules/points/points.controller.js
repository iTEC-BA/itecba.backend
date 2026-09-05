import { supabase } from "../../config/supabase.js";
import { grantPoints } from "./points.service.js";
import { notFound, badRequest } from "../../middlewares/errorHandler.js";

// Formatea snake_case de Postgres a camelCase para React
const mapActivity = (d) => ({
  id: d.key, key: d.key, name: d.name, description: d.description,
  points: d.points, cooldownMinutes: d.cooldown_minutes,
  dailyCap: d.daily_cap, isActive: d.is_active
});

export const getPublicActivities = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from("point_activities").select("*").eq("is_active", true);
    if (error) throw error;
    res.status(200).json(data.map(mapActivity));
  } catch (err) { next(err); }
};

export const getAdminActivities = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from("point_activities").select("*").order("key");
    if (error) throw error;
    res.status(200).json(data.map(mapActivity));
  } catch (err) { next(err); }
};

export const updateActivity = async (req, res, next) => {
  try {
    const { id } = req.params;
    const update = {};
    if (req.body.name !== undefined) update.name = req.body.name;
    if (req.body.description !== undefined) update.description = req.body.description;
    if (req.body.points !== undefined) update.points = req.body.points;
    if (req.body.cooldownMinutes !== undefined) update.cooldown_minutes = req.body.cooldownMinutes;
    if (req.body.dailyCap !== undefined) update.daily_cap = req.body.dailyCap;
    if (req.body.isActive !== undefined) update.is_active = req.body.isActive;
    update.updated_at = new Date().toISOString();

    if (Object.keys(update).length === 1 && update.updated_at) return next(badRequest("Sin cambios."));

    const { data, error } = await supabase.from("point_activities").update(update).eq("key", id).select().single();
    if (error || !data) return next(notFound("Actividad no encontrada."));

    res.status(200).json(mapActivity(data));
  } catch (err) { next(err); }
};

export const grantPointsEndpoint = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { activityKey, context } = req.body;
    if (!activityKey) return next(badRequest("activityKey requerido."));

    const result = await grantPoints(uid, activityKey, context ?? {});
    res.status(200).json(result);
  } catch (err) { next(err); }
};

export const getHistory = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const { data, error } = await supabase
      .from("point_logs")
      .select(`activity_key, points_awarded, context, created_at, point_activities (name)`)
      .eq("uid", uid)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const enriched = data.map((l) => ({
      activityKey: l.activity_key,
      pointsAwarded: l.points_awarded,
      context: l.context,
      createdAt: l.created_at,
      activityName: l.point_activities?.name ?? l.activity_key
    }));

    res.status(200).json(enriched);
  } catch (err) { next(err); }
};
