import { compressAndUploadCover } from "./cloudinary.helper.js";
import ytpl from "ytpl";
import Course from "./course.model.js";
import { notFound, badRequest } from "../../middlewares/errorHandler.js";
import { normalizeStr } from "../../utils/normalize.js";

const buildSearchFilter = (query = {}) => {
  const filter = { $or: [{ status: "approved" }, { status: { $exists: false } }, { status: null }, { status: "" }] };
  if (query.search?.trim()) filter._searchable = { $regex: normalizeStr(query.search), $options: "i" };
  if (query.materia?.trim()) filter.materia = { $regex: `^${query.materia.trim()}$`, $options: "i" };
  if (query.categoria === "Oficial" || query.categoria === "Comunidad") filter.categoria = query.categoria;
  return filter;
};

const parsePagination = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 50));
  return { page, limit, skip: (page - 1) * limit };
};

// NUEVO: normaliza el array de profesores recibido desde el frontend
// (soporta más de un profesor por curso). Descarta strings vacíos y
// recorta espacios; si no llega nada válido devuelve un array vacío.
// Soporta Markdown: no se escapan ni filtran caracteres como *, _, #, [], etc.
// El renderizado seguro (sanitización de HTML embebido) es responsabilidad
// del frontend (<MarkdownContent/> vía react-markdown, que no ejecuta HTML crudo).
const normalizeProfesores = (input) => {
  if (!Array.isArray(input)) return [];
  return input
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p.length > 0);
};

export const getCourses = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = buildSearchFilter(req.query);
    const [courses, total] = await Promise.all([
      Course.find(filter).select("-sections.lessons.brokenReports").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Course.countDocuments(filter),
    ]);
    res.status(200).json({ courses, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

export const getAllCourses = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const search = req.query.search?.trim();
    const filter = search ? { _searchable: { $regex: normalizeStr(search), $options: "i" } } : {};
    const [courses, total] = await Promise.all([
      Course.find(filter).select("-sections.lessons.brokenReports").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Course.countDocuments(filter),
    ]);
    res.status(200).json({ courses, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

export const getCourseById = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id).select("-sections.lessons.brokenReports").lean();
    if (!course) return next(notFound("Curso no encontrado"));
    res.status(200).json(course);
  } catch (err) { next(err); }
};

export const createCourse = async (req, res, next) => {
  try {
    const { title, description, imageUrl, playlistId, sections, materia, categoria, status, profesores } = req.body;
    if (!title?.trim() || !sections?.length) return next(badRequest("title y sections son requeridos"));
    const course = await Course.create({
      title: title.trim(), description: description?.trim() ?? "", imageUrl: imageUrl?.trim() ?? "",
      playlistId: playlistId?.trim() ?? "", materia: materia?.trim() ?? "", categoria: categoria ?? "Comunidad",
      status: status ?? "approved", sections, profesores: normalizeProfesores(profesores), createdBy: req.user?.uid ?? "",
    });
    res.status(201).json(course);
  } catch (err) { next(err); }
};

export const updateCourse = async (req, res, next) => {
  try {
    // NUEVO: "profesores" habilitado como campo editable (soporta múltiples).
    const allowed = ["title", "description", "imageUrl", "playlistId", "sections", "materia", "categoria", "status", "profesores"];
    const update = {};
    for (const key of allowed) if (req.body[key] !== undefined) update[key] = req.body[key];
    if (update.profesores !== undefined) update.profesores = normalizeProfesores(update.profesores);
    if (Object.keys(update).length === 0) return next(badRequest("Sin datos para actualizar"));

    const course = await Course.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!course) return next(notFound("Curso no encontrado"));
    res.status(200).json(course);
  } catch (err) { next(err); }
};

export const deleteCourse = async (req, res, next) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) return next(notFound("Curso no encontrado"));
    res.status(200).json({ message: "Curso eliminado" });
  } catch (err) { next(err); }
};

export const updateCourseStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["draft", "approved", "archived"].includes(status)) return next(badRequest("status inválido"));
    const course = await Course.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!course) return next(notFound("Curso no encontrado"));
    res.status(200).json({ _id: course._id, status: course.status });
  } catch (err) { next(err); }
};

// --- MIGRACIÓN AUTOMÁTICA DE DATOS LEGACY ---
export const migrateLegacyCourses = async (req, res, next) => {
  try {
    const courses = await Course.find({ videos: { $exists: true, $not: { $size: 0 } } }).select("+videos");
    let migrated = 0;
    for (const c of courses) {
      if (c.videos && c.videos.length > 0 && (!c.sections || c.sections.length === 0)) {
        c.sections = [{ title: "Contenido General", orderIndex: 0, lessons: c.videos }];
        c.videos = undefined;
        await c.save();
        migrated++;
      }
    }
    res.status(200).json({ message: `Migración completada. ${migrated} cursos actualizados.` });
  } catch (err) { next(err); }
};

// Helpers para encontrar lecciones profundas
const findLesson = (course, lessonId) => {
  for (const sec of course.sections) {
    const less = sec.lessons.id(lessonId);
    if (less) return less;
  }
  return null;
};

export const reportBrokenVideo = async (req, res, next) => {
  try {
    const { id: courseId, videoId } = req.params;
    const { reason = "no-reproduce" } = req.body;
    const course = await Course.findById(courseId);
    if (!course) return next(notFound("Curso no encontrado"));
    
    const lesson = findLesson(course, videoId);
    if (!lesson) return next(notFound("Lección no encontrada"));

    if (!req.user?.uid) return next(badRequest("Usuario no identificado"));
    if (lesson.brokenReports.some(r => r.reportedBy === req.user.uid)) return res.status(409).json({ message: "Ya reportaste este video." });
    
    lesson.brokenReports.push({ reportedBy: req.user.uid, reason });
    if (lesson.brokenReports.length >= 3) lesson.isBroken = true;
    
    await course.save();
    res.status(200).json({ message: "Reporte enviado.", reportCount: lesson.brokenReports.length });
  } catch (err) { next(err); }
};

export const getBrokenVideos = async (req, res, next) => {
  try {
    const courses = await Course.find({
      $or: [{ "sections.lessons.isBroken": true }, { "sections.lessons.brokenReports.0": { $exists: true } }]
    }).select("title materia sections").lean();

    const broken = [];
    for (const course of courses) {
      for (const section of course.sections || []) {
        for (const lesson of section.lessons || []) {
          if (lesson.isBroken || lesson.brokenReports?.length > 0) {
            broken.push({
              courseId: course._id, courseTitle: course.title, materia: course.materia, sectionTitle: section.title,
              video: { _id: lesson._id, youtubeId: lesson.youtubeId, title: lesson.title, isBroken: lesson.isBroken, reportCount: lesson.brokenReports?.length ?? 0 }
            });
          }
        }
      }
    }
    broken.sort((a, b) => b.video.reportCount - a.video.reportCount);
    res.status(200).json({ total: broken.length, broken });
  } catch (err) { next(err); }
};

// --- Implementación real de las operaciones sobre videos rotos ---
export const fixBrokenVideo = async (req, res, next) => {
  try {
    const { id: courseId, videoId } = req.params;
    const course = await Course.findById(courseId);
    if (!course) return next(notFound("Curso no encontrado"));

    const lesson = findLesson(course, videoId);
    if (!lesson) return next(notFound("Lección no encontrada"));

    lesson.isBroken = false;
    lesson.brokenReports = [];
    await course.save();

    res.status(200).json({ message: "Video marcado como reparado.", videoId });
  } catch (err) { next(err); }
};

export const deleteVideo = async (req, res, next) => {
  try {
    const { id: courseId, videoId } = req.params;
    const course = await Course.findById(courseId);
    if (!course) return next(notFound("Curso no encontrado"));

    let removed = false;
    for (const sec of course.sections) {
      const lesson = sec.lessons.id(videoId);
      if (lesson) {
        lesson.deleteOne();
        removed = true;
        break;
      }
    }
    if (!removed) return next(notFound("Lección no encontrada"));

    await course.save();
    res.status(200).json({ message: "Video eliminado.", videoId });
  } catch (err) { next(err); }
};

export const clearVideoReports = async (req, res, next) => {
  try {
    const { id: courseId, videoId } = req.params;
    const course = await Course.findById(courseId);
    if (!course) return next(notFound("Curso no encontrado"));

    const lesson = findLesson(course, videoId);
    if (!lesson) return next(notFound("Lección no encontrada"));

    lesson.brokenReports = [];
    lesson.isBroken = false;
    await course.save();

    res.status(200).json({ message: "Reportes limpiados.", videoId });
  } catch (err) { next(err); }
};

// NOTA: fetchPlaylist requiere la integración real con `ytpl` (extracción de
// metadata de la playlist de YouTube). No se reimplementa a ciegas acá por
// no contar con el detalle original de esa lógica en el contexto relevado;
// se deja el stub explícito para que no falle silenciosamente en runtime
// sin al menos devolver un error claro.
export const fetchPlaylist = async (req, res, next) => {
  try {
    return next(badRequest("fetchPlaylist no implementado en este build: revisar integración con ytpl."));
  } catch (err) { next(err); }
};

export const uploadCover = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No se recibió ninguna imagen" });
    const url = await compressAndUploadCover(req.file.buffer);
    res.status(200).json({ url });
  } catch (err) {
    next(err);
  }
};
