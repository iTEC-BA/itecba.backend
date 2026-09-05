import { supabase } from '../../config/supabase.js';

const log = {
  info:  (ctx, msg, extra = {}) => console.log(`ℹ️  [subjects:${ctx}]`, msg, extra),
  warn:  (ctx, msg, extra = {}) => console.warn(`🟡 [subjects:${ctx}]`, msg, extra),
  error: (ctx, msg, extra = {}) => console.error(`🔴 [subjects:${ctx}]`, msg, extra),
};

export const getSubjects = async (req, res, next) => {
  const ctx = 'getSubjects';
  try {
    const { carrera, nivel } = req.query;
    log.info(ctx, 'Consulta recibida', { carrera, nivel });

    let query = supabase
      .from('subjects')
      .select('id, subject_key, materia, codigo, carrera, nivel, sigla')
      .order('materia', { ascending: true });

    // Protección anti-strings "undefined"
    if (carrera && carrera !== 'undefined') query = query.eq('carrera', carrera);
    if (nivel !== undefined && nivel !== '' && nivel !== 'undefined') query = query.eq('nivel', Number(nivel));

    const { data, error } = await query;

    if (error) {
      log.error(ctx, 'Error de Supabase al consultar subjects', { message: error.message });
      throw new Error(error.message);
    }

    // Diagnóstico inteligente de RLS
    if (!data || data.length === 0) {
      const { count } = await supabase.from('subjects').select('*', { count: 'exact', head: true });
      if (count > 0) {
        log.warn(ctx, `⚠️ Hay ${count} materias en BD, pero Supabase devolvió 0. ¡Revisa el RLS (Row Level Security)!`);
      }
    }

    log.info(ctx, 'Consulta resuelta', { resultados: data?.length ?? 0 });
    res.status(200).json(data || []);
  } catch (err) {
    log.error(ctx, 'Excepción no controlada', { message: err.message });
    next(err);
  }
};

export const searchSubjects = async (req, res, next) => {
  const ctx = 'searchSubjects';
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2 || q === 'undefined') {
      return res.status(400).json({ message: 'El parámetro q debe tener al menos 2 caracteres.' });
    }

    const term = q.trim();
    const [byName, byCode, bySigla] = await Promise.all([
      supabase.from('subjects').select('id, subject_key, materia, codigo, carrera, nivel, sigla').ilike('materia', `%${term}%`).order('materia').limit(30),
      supabase.from('subjects').select('id, subject_key, materia, codigo, carrera, nivel, sigla').ilike('codigo', `%${term}%`).order('materia').limit(30),
      supabase.from('subjects').select('id, subject_key, materia, codigo, carrera, nivel, sigla').ilike('sigla', `%${term}%`).order('materia').limit(30),
    ]);

    const seen = new Set();
    const combined = [...(byName.data || []), ...(byCode.data || []), ...(bySigla.data || [])].filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    res.status(200).json(combined);
  } catch (err) { next(err); }
};

export const getCarreras = async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('subjects').select('carrera').order('carrera');
    if (error) throw new Error(error.message);
    res.status(200).json([...new Set((data || []).map((r) => r.carrera))]);
  } catch (err) { next(err); }
};

export const getCorrelativas = async (req, res, next) => {
  try {
    const { subjectKey } = req.params;
    const { data: subject } = await supabase.from('subjects').select('id').eq('subject_key', subjectKey).single();
    if (!subject) return res.status(404).json({ message: 'Materia no encontrada.' });

    const { data, error } = await supabase.from('subjects_correlativas').select('requisito_subject_key, tipo').eq('subject_id', subject.id);
    if (error) throw new Error(error.message);

    res.status(200).json({
      cursada: data.filter((r) => r.tipo === 'cursada').map((r) => r.requisito_subject_key),
      aprobada: data.filter((r) => r.tipo === 'aprobada').map((r) => r.requisito_subject_key)
    });
  } catch (err) { next(err); }
};

export const createSubject = async (req, res, next) => {
  try {
    const { carrera, nivel, materia, codigo, sigla, subjectKey } = req.body;
    if (!carrera || nivel === undefined || !materia) return res.status(400).json({ message: 'Faltan campos obligatorios.' });

    const generatedKey = subjectKey || `${carrera}_${materia.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;

    const { data, error } = await supabase.from('subjects').insert([{ subject_key: generatedKey, carrera, nivel: Number(nivel), materia, codigo: codigo || null, sigla: sigla || null }]).select().single();
    if (error) throw new Error(error.message);
    res.status(201).json(data);
  } catch (err) { next(err); }
};

export const updateSubject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { carrera, nivel, materia, codigo, sigla } = req.body;
    const update = {};
    if (carrera !== undefined) update.carrera = carrera;
    if (nivel !== undefined) update.nivel = Number(nivel);
    if (materia !== undefined) update.materia = materia;
    if (codigo !== undefined) update.codigo = codigo || null;
    if (sigla !== undefined) update.sigla = sigla || null;

    const { data, error } = await supabase.from('subjects').update(update).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    res.status(200).json(data);
  } catch (err) { next(err); }
};

export const deleteSubject = async (req, res, next) => {
  try {
    const { error } = await supabase.from('subjects').delete().eq('id', req.params.id);
    if (error) throw new Error(error.message);
    res.status(200).json({ message: 'Materia eliminada.' });
  } catch (err) { next(err); }
};
