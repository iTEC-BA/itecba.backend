import admin from "firebase-admin";
import { supabase } from "../../config/supabase.js";

export const grantPoints = async (uid, activityKey, context = {}) => {
  try {
    // 1. Buscar actividad en Supabase
    const { data: activity, error: actErr } = await supabase
      .from("point_activities")
      .select("*")
      .eq("key", activityKey)
      .single();

    if (actErr || !activity) return { granted: false, reason: "activity_not_found" };
    if (!activity.is_active) return { granted: false, reason: "activity_inactive" };

    const now = new Date();

    // 2. Verificar cooldown
    if (activity.cooldown_minutes > 0) {
      const cooldownMs = activity.cooldown_minutes * 60 * 1000;
      const since = new Date(now.getTime() - cooldownMs).toISOString();

      const { data: recent, error: recentError } = await supabase
        .from("point_logs")
        .select("id")
        .eq("uid", uid)
        .eq("activity_key", activityKey)
        .gte("created_at", since)
        .limit(1);
      if (recentError) throw recentError;

      if (recent && recent.length > 0) return { granted: false, reason: "cooldown" };
    }

    // 3. Verificar tope diario
    if (activity.daily_cap > 0) {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      const { count, error: countError } = await supabase
        .from("point_logs")
        .select("*", { count: "exact", head: true })
        .eq("uid", uid)
        .eq("activity_key", activityKey)
        .gte("created_at", startOfDay.toISOString());
      if (countError) throw countError;

      if (count >= activity.daily_cap) return { granted: false, reason: "daily_cap_reached" };
    }

    // 4. Sumar puntos en Firestore (atómico)
    const db = admin.firestore();
    const userRef = db.collection("users").doc(uid);
    await userRef.set({
      points: admin.firestore.FieldValue.increment(activity.points),
    }, { merge: true });

    // 5. Registrar en el log de Supabase
    const { error: logError } = await supabase.from("point_logs").insert({
      uid,
      activity_key: activityKey,
      points_awarded: activity.points,
      context,
      created_at: now.toISOString()
    });
    if (logError) {
      console.error("[Points] No se pudo registrar el movimiento:", logError.message);
      return { granted: true, points: activity.points, warning: "log_failed" };
    }

    return { granted: true, points: activity.points };
  } catch (err) {
    console.error(`[Points] Error al otorgar puntos:`, err.message);
    return { granted: false, reason: "internal_error" };
  }
};
