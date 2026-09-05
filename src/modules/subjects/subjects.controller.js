import { supabase } from '../../config/supabase.js';

// ── Logger mínimo con contexto y severidad ──────────────────────────────────
// No agrega una dependencia nueva; homogeneiza el formato de logs de este
// módulo para que sean fáciles de grepear en producción (Render, etc.).
const log = {
  info:  (ctx, msg, extra = {}) => console.log(`ℹ️  [subjects:${ctx}]`, msg, extra),
  warn:  (ctx, msg, extra = {}) => console.warn(`🟡 [subjects:${ctx}]`, msg, extra),
  error: (ctx, msg, extra = {}) => console.error(`🔴 [subjects:${ctx}]`, msg, extra),
};

// GET /api/subjects?carrera=sistemas&nivel=2
export const getSubjects = async (req, res, next) => {
  const ctx = 'getSubjects';
  try {
    const { carrera, nivel } = req.query;
    log.info(ctx, 'Consulta recibida', { carrera, nivel });

    let query = supabase
      .from('subjects')
      .select('id, subject_key, materia, codigo, carrera, nivel, sigla')
      .order('materia', { ascending: true });

    if (carrera) query = query.eq('carrera', carrera);
    if (nivel !== undefined && nivel !== '') query = query.eq('nivel', Number(nivel));

    const { data, error } = await query;

    if (error) {
      log.error(ctx, 'Error de Supabase al consultar subjects', {
        message: error.message,
        code: error.code,
        carrera,
        nivel,
      });
      throw new Error(error.message);
    }

    log.info(ctx, 'Consulta resuelta', { resultados: data?.length ?? 0 });
    res.status(200).json(data || []);
  } catch (err) {
    log.error(ctx, 'Excepción no controlada', { message: err.message });
    next(err);
  }
};

// GET /api/subjects/search?q=anali — busca por nombre, código o sigla
export const searchSubjects = async (req, res, next) => {
  const ctx = 'searchSubjects';
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      log.warn(ctx, 'Parámetro q inválido', { q });
      return res.status(400).json({ message: 'El parámetro q debe tener al menos 2 caracteres.' });
    }

    const term = q.trim();
    log.info(ctx, 'Búsqueda recibida', { term });

    const [byName, byCode, bySigla] = await Promise.all([
      supabase
        .from('subjects')
        .select('id, subject_key, materia, codigo, carrera, nivel, sigla')
        .ilike('materia', `%${term}%`)
        .order('materia')
        .limit(30),
      supabase
        .from('subjects')
        .select('id, subject_key, materia, codigo, carrera, nivel, sigla')
        .ilike('codigo', `%${term}%`)
        .order('materia')
        .limit(30),
      supabase
        .from('subjects')
        .select('id, subject_key, materia, codigo, carrera, nivel, sigla')
        .ilike('sigla', `%${term}%`)
        .order('materia')
        .limit(30),
    ]);

    for (const [label, res_] of [['materia', byName], ['codigo', byCode], ['sigla', bySigla]]) {
      if (res_.error) {
        log.error(ctx, `Error de Supabase buscando por ${label}`, { message: res_.error.message });
        throw new Error(res_.error.message);
      }
    }

    const seen = new Set();
    const combined = [...(byName.data || []), ...(byCode.data || []), ...(bySigla.data || [])].filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    log.info(ctx, 'Búsqueda resuelta', { resultados: combined.length });
    res.status(200).json(combined);
  } catch (err) {
    log.error(ctx, 'Excepción no controlada', { message: err.message });
    next(err);
  }
};

// GET /api/subjects/carreras
export const getCarreras = async (req, res, next) => {
  const ctx = 'getCarreras';
  try {
    const { data, error } = await supabase.from('subjects').select('carrera').order('carrera');
    if (error) {
      log.error(ctx, 'Error de Supabase al listar carreras', { message: error.message });
      throw new Error(error.message);
    }
    const unique = [...new Set((data || []).map((r) => r.carrera))];
    log.info(ctx, 'Carreras resueltas', { total: unique.length });
    res.status(200).json(unique);
  } catch (err) {
    log.error(ctx, 'Excepción no controlada', { message: err.message });
    next(err);
  }
};

// GET /api/subjects/:subjectKey/correlativas
export const getCorrelativas = async (req, res, next) => {
  const ctx = 'getCorrelativas';
  try {
    const { subjectKey } = req.params;
    log.info(ctx, 'Consulta de correlativas', { subjectKey });

    const { data: subject, error: subjectError } = await supabase
      .from('subjects')
      .select('id')
      .eq('subject_key', subjectKey)
      .single();

    if (subjectError || !subject) {
      log.warn(ctx, 'Materia no encontrada', { subjectKey, message: subjectError?.message });
      return res.status(404).json({ message: 'Materia no encontrada.' });
    }

    const { data, error } = await supabase
      .from('subjects_correlativas')
      .select('requisito_subject_key, tipo')
      .eq('subject_id', subject.id);

    if (error) {
      log.error(ctx, 'Error de Supabase al traer correlativas', { message: error.message, subjectKey });
      throw new Error(error.message);
    }

    const cursada = data.filter((r) => r.tipo === 'cursada').map((r) => r.requisito_subject_key);
    const aprobada = data.filter((r) => r.tipo === 'aprobada').map((r) => r.requisito_subject_key);

    res.status(200).json({ cursada, aprobada });
  } catch (err) {
    log.error(ctx, 'Excepción no controlada', { message: err.message });
    next(err);
  }
};

// POST /api/subjects — solo admin
export const createSubject = async (req, res, next) => {
  const ctx = 'createSubject';
  try {
    const { carrera, nivel, materia, codigo, sigla, subjectKey } = req.body;
    if (!carrera || nivel === undefined || nivel === null || !materia) {
      log.warn(ctx, 'Payload incompleto', { body: req.body });
      return res.status(400).json({ message: 'carrera, nivel y materia son requeridos.' });
    }

    // Si no mandan subject_key explícito (alta manual desde el admin),
    // generamos uno sintético siguiendo el mismo patrón que subject.ts:
    // '<carrera>_<nombre_normalizado>'
    const generatedKey =
      subjectKey ||
      `${carrera}_${materia
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')}`;

    const { data, error } = await supabase
      .from('subjects')
      .insert([
        {
          subject_key: generatedKey,
          carrera,
          nivel: Number(nivel),
          materia,
          codigo: codigo || null,
          sigla: sigla || null,
        },
      ])
      .select()
      .single();

    if (error) {
      log.error(ctx, 'Error de Supabase al crear materia', { message: error.message, body: req.body });
      throw new Error(error.message);
    }

    log.info(ctx, 'Materia creada', { id: data.id, subject_key: data.subject_key });
    res.status(201).json(data);
  } catch (err) {
    log.error(ctx, 'Excepción no controlada', { message: err.message });
    next(err);
  }
};

// PUT /api/subjects/:id — solo admin
export const updateSubject = async (req, res, next) => {
  const ctx = 'updateSubject';
  try {
    const { id } = req.params;
    const { carrera, nivel, materia, codigo, sigla } = req.body;
    const update = {};
    if (carrera !== undefined) update.carrera = carrera;
    if (nivel !== undefined) update.nivel = Number(nivel);
    if (materia !== undefined) update.materia = materia;
    if (codigo !== undefined) update.codigo = codigo || null;
    if (sigla !== undefined) update.sigla = sigla || null;

    const { data, error } = await supabase
      .from('subjects')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      log.error(ctx, 'Error de Supabase al actualizar materia', { message: error.message, id });
      throw new Error(error.message);
    }
    if (!data) {
      log.warn(ctx, 'Materia no encontrada para actualizar', { id });
      return res.status(404).json({ message: 'Materia no encontrada.' });
    }

    log.info(ctx, 'Materia actualizada', { id });
    res.status(200).json(data);
  } catch (err) {
    log.error(ctx, 'Excepción no controlada', { message: err.message });
    next(err);
  }
};

// DELETE /api/subjects/:id — solo admin
export const deleteSubject = async (req, res, next) => {
  const ctx = 'deleteSubject';
  try {
    const { id } = req.params;
    const { error } = await supabase.from('subjects').delete().eq('id', id);
    if (error) {
      log.error(ctx, 'Error de Supabase al eliminar materia', { message: error.message, id });
      throw new Error(error.message);
    }
    log.info(ctx, 'Materia eliminada', { id });
    res.status(200).json({ message: 'Materia eliminada.' });
  } catch (err) {
    log.error(ctx, 'Excepción no controlada', { message: err.message });
    next(err);
  }
};
