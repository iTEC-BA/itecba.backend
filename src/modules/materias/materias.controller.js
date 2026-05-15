import { supabase } from '../../config/supabase.js';

// GET /api/materias?carrera=sistemas&nivel=2
export const getMaterias = async (req, res, next) => {
  try {
    const { carrera, nivel } = req.query;
    let query = supabase
      .from('materias')
      .select('id, materia, codigo, carrera, nivel')
      .order('materia', { ascending: true });
    if (carrera) query = query.eq('carrera', carrera);
    if (nivel)   query = query.eq('nivel',   nivel);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    res.status(200).json(data || []);
  } catch (err) {
    next(err);
  }
};

// GET /api/materias/search?q=anali  —  busca por nombre O por código
export const searchMaterias = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ message: 'El parámetro q debe tener al menos 2 caracteres.' });
    }

    const term = q.trim().toLowerCase();

    // Buscamos en ambas columnas en paralelo
    const [byName, byCode] = await Promise.all([
      supabase
        .from('materias')
        .select('id, materia, codigo, carrera, nivel')
        .ilike('materia', `%${term}%`)
        .order('materia')
        .limit(30),
      supabase
        .from('materias')
        .select('id, materia, codigo, carrera, nivel')
        .ilike('codigo', `%${term}%`)
        .order('materia')
        .limit(30),
    ]);

    if (byName.error) throw new Error(byName.error.message);
    if (byCode.error) throw new Error(byCode.error.message);

    // Unir y deduplicar por id
    const seen = new Set();
    const combined = [...(byName.data || []), ...(byCode.data || [])].filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    res.status(200).json(combined);
  } catch (err) {
    next(err);
  }
};

// GET /api/materias/carreras
export const getCarreras = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('materias')
      .select('carrera')
      .order('carrera');
    if (error) throw new Error(error.message);
    const unique = [...new Set((data || []).map(r => r.carrera))];
    res.status(200).json(unique);
  } catch (err) {
    next(err);
  }
};

// POST /api/materias  — solo admin
export const createMateria = async (req, res, next) => {
  try {
    const { carrera, nivel, materia, codigo } = req.body;
    if (!carrera || !nivel || !materia) {
      return res.status(400).json({ message: 'carrera, nivel y materia son requeridos.' });
    }
    const { data, error } = await supabase
      .from('materias')
      .insert([{ carrera, nivel: String(nivel), materia, codigo: codigo || null }])
      .select()
      .single();
    if (error) throw new Error(error.message);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
};

// PUT /api/materias/:id  — solo admin
export const updateMateria = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { carrera, nivel, materia, codigo } = req.body;
    const update = {};
    if (carrera !== undefined) update.carrera = carrera;
    if (nivel   !== undefined) update.nivel   = String(nivel);
    if (materia !== undefined) update.materia = materia;
    if (codigo  !== undefined) update.codigo  = codigo || null;

    const { data, error } = await supabase
      .from('materias')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ message: 'Materia no encontrada.' });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/materias/:id  — solo admin
export const deleteMateria = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('materias').delete().eq('id', id);
    if (error) throw new Error(error.message);
    res.status(200).json({ message: 'Materia eliminada.' });
  } catch (err) {
    next(err);
  }
};
