import { supabase } from "../../config/supabase.js";
import { badRequest, notFound } from "../../middlewares/errorHandler.js";

export const getCalendarEvents = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('academic_calendar')
      .select('*')
      .order('date', { ascending: true });

    if (error) throw error;
    res.status(200).json(data);
  } catch (err) { next(err); }
};

export const createEvent = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Acceso denegado" });
    
    const { title, description, date, type } = req.body;
    if (!title || !date) return next(badRequest("Título y fecha son obligatorios"));

    const { data, error } = await supabase
      .from('academic_calendar')
      .insert([{ title, description, date, type, created_by: req.user.uid }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) { next(err); }
};

export const deleteEvent = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Acceso denegado" });
    
    const { id } = req.params;
    const { error } = await supabase.from('academic_calendar').delete().eq('id', id);

    if (error) throw error;
    res.status(200).json({ message: "Evento eliminado" });
  } catch (err) { next(err); }
};

// Tarea para auto-limpieza (Llamada desde el cron de index.js)
export const cleanupOldEvents = async () => {
  const now = new Date().toISOString();
  await supabase.from('academic_calendar').delete().lt('date', now);
  console.log("🧹 Calendario: Limpieza de eventos pasados completada.");
};
