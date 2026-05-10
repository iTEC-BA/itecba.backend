import { supabase } from "../../config/supabase.js";
import { badRequest, notFound } from "../../middlewares/errorHandler.js";
import webpush from "web-push";
import { turso } from "../../config/turso.js"; // Usamos la misma tabla de suscripciones del foro

export const getEvents = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('calendar_events').select('*').order('date', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
};

export const createEvent = async (req, res, next) => {
  try {
    const { title, description, subtitle, date, type } = req.body;
    const { data, error } = await supabase.from('calendar_events').insert([{ title, description, subtitle, date, type }]).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) { next(err); }
};

export const deleteEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('calendar_events').delete().eq('id', id);
    if (error) throw error;
    res.json({ message: "Evento eliminado" });
  } catch (err) { next(err); }
};

// ── TAREAS PROGRAMADAS (CRON) ──────────────────────────────────────────────

export const autoCleanup = async () => {
  const today = new Date().toISOString().split('T')[0];
  const { error } = await supabase.from('calendar_events').delete().lt('date', today);
  if (!error) console.log("🧹 [CALENDAR] Eventos pasados eliminados.");
};

export const checkAndSendReminders = async () => {
  try {
    // 1. Buscar eventos que ocurran MAÑANA
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { data: events, error } = await supabase
      .from('calendar_events')
      .select('*')
      .eq('date', tomorrowStr);

    if (error || !events || events.length === 0) return;

    // 2. Obtener todas las suscripciones Push (usando la tabla que ya tienes en Turso)
    const { rows: subs } = await turso.execute("SELECT subscription FROM push_subscriptions");
    if (subs.length === 0) return;

    // 3. Enviar notificación por cada evento
    for (const event of events) {
      const payload = JSON.stringify({
        title: `📅 iTEC Recordatorio: ${event.type.toUpperCase()}`,
        body: `Mañana es: ${event.title}. ${event.subtitle || ''}`,
        url: "/calendario"
      });

      subs.forEach(async (row) => {
        try {
          const sub = JSON.parse(row.subscription);
          await webpush.sendNotification(sub, payload);
        } catch (e) { /* Ignorar suscripciones expiradas */ }
      });
    }
    console.log(`🔔 [CALENDAR] Recordatorios enviados para ${events.length} evento(s).`);
  } catch (error) {
    console.error("Error en cron de recordatorios:", error);
  }
};

// ── PATCH /api/calendar/:id ──────────────────────────────────
export const updateEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, subtitle, date, type } = req.body;

    const updateData = {};
    if (title       !== undefined) updateData.title       = title;
    if (description !== undefined) updateData.description = description;
    if (subtitle    !== undefined) updateData.subtitle    = subtitle;
    if (date        !== undefined) updateData.date        = date;
    if (type        !== undefined) updateData.type        = type;

    const { data, error } = await supabase
      .from("calendar_events")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return next(notFound("Evento no encontrado"));
    res.json(data);
  } catch (err) { next(err); }
};
