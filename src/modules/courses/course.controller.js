// src/modules/courses/course.controller.js
import ytpl         from "ytpl";
import Course       from "./course.model.js";
import { notFound, badRequest } from "../../middlewares/errorHandler.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Formatea segundos → "MM:SS" */
const fmtDuration = (secs) => {
  if (!secs) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

// ── GET /api/courses  — público: solo cursos aprobados ────────────────────────
export const getCourses = async (req, res, next) => {
  try {
    const filter = { status: "approved" };
    if (req.query.materia)   filter.materia   = req.query.materia;
    if (req.query.categoria) filter.categoria = req.query.categoria;

    const courses = await Course.find(filter)
      .select("-videos.brokenReports") // No exponemos reportes a estudiantes
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json(courses);
  } catch (err) {
    next(err);
  }
};

// ── GET /api/courses/all  — admin: incluye draft y archived ──────────────────
export const getAllCourses = async (req, res, next) => {
  try {
    const courses = await Course.find()
      .select("-videos.brokenReports")
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(courses);
  } catch (err) {
    next(err);
  }
};

// ── GET /api/courses/:id  — público ──────────────────────────────────────────
export const getCourseById = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id)
      .select("-videos.brokenReports")
      .lean();
    if (!course) return next(notFound("Curso no encontrado"));
    res.status(200).json(course);
  } catch (err) {
    next(err);
  }
};

// ── POST /api/courses  — admin ────────────────────────────────────────────────
export const createCourse = async (req, res, next) => {
  try {
    const { title, description, imageUrl, playlistId, videos, materia, categoria, status } = req.body;
    if (!title?.trim() || !videos?.length) {
      return next(badRequest("title y videos son requeridos"));
    }

    const course = await Course.create({
      title: title.trim(),
      description: description?.trim() ?? "",
      imageUrl: imageUrl?.trim() ?? "",
      playlistId: playlistId?.trim() ?? "",
      materia: materia?.trim() ?? "",
      categoria: categoria ?? "Comunidad",
      status: status ?? "approved",
      videos,
      createdBy: req.user?.uid ?? "",
    });

    res.status(201).json(course);
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/courses/:id  — admin ─────────────────────────────────────────────
export const updateCourse = async (req, res, next) => {
  try {
    const allowed = ["title", "description", "imageUrl", "playlistId", "videos", "materia", "categoria", "status"];
    const update  = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (Object.keys(update).length === 0) return next(badRequest("Sin datos para actualizar"));

    const course = await Course.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!course) return next(notFound("Curso no encontrado"));
    res.status(200).json(course);
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/courses/:id/status  — admin: publicar/archivar ───────────────
export const updateCourseStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["draft", "approved", "archived"].includes(status)) {
      return next(badRequest("status debe ser draft, approved o archived"));
    }
    const course = await Course.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!course) return next(notFound("Curso no encontrado"));
    res.status(200).json({ _id: course._id, status: course.status });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/courses/:id  — admin ─────────────────────────────────────────
export const deleteCourse = async (req, res, next) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) return next(notFound("Curso no encontrado"));
    res.status(200).json({ message: "Curso eliminado" });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/courses/fetch-playlist  — admin: importar desde YouTube ────────
// Reemplaza youtube-dl-exec con ytpl (pure JS, sin binario externo)
export const fetchPlaylist = async (req, res, next) => {
  try {
    const { playlistUrl } = req.body;
    if (!playlistUrl?.trim()) return next(badRequest("playlistUrl requerida"));

    // ytpl acepta URLs de playlist de YouTube directamente
    const playlist = await ytpl(playlistUrl.trim(), { limit: Infinity });

    const videos = playlist.items.map((item) => ({
      youtubeId: item.id,
      title:     item.title,
      duration:  item.duration ?? "0:00",
    }));

    res.status(200).json({ title: playlist.title, videos });
  } catch (err) {
    // Errores comunes: playlist privada, URL inválida
    if (err.message?.includes("private") || err.message?.includes("unavailable")) {
      return next(badRequest("Playlist privada o no disponible"));
    }
    next(err);
  }
};

// ── POST /api/courses/:id/videos/:videoId/report  — autenticado ──────────────
// Los estudiantes reportan videos que no funcionan
export const reportBrokenVideo = async (req, res, next) => {
  try {
    const { id: courseId, videoId } = req.params;
    const { reason = "no-reproduce" } = req.body;
    const uid = req.user.uid;

    const VALID_REASONS = ["no-reproduce", "error-404", "privado", "contenido-incorrecto"];
    if (!VALID_REASONS.includes(reason)) {
      return next(badRequest(`reason inválido. Usar: ${VALID_REASONS.join(", ")}`));
    }

    const course = await Course.findById(courseId);
    if (!course) return next(notFound("Curso no encontrado"));

    const video = course.videos.id(videoId);
    if (!video) return next(notFound("Video no encontrado en este curso"));

    // Evitar reportes duplicados del mismo usuario
    const alreadyReported = video.brokenReports.some((r) => r.reportedBy === uid);
    if (alreadyReported) {
      return res.status(409).json({ message: "Ya reportaste este video." });
    }

    video.brokenReports.push({ reportedBy: uid, reason });

    // Auto-marcar como roto si supera 3 reportes
    if (video.brokenReports.length >= 3) {
      video.isBroken = true;
    }

    await course.save();

    res.status(200).json({
      message: "Reporte enviado. Gracias por colaborar.",
      reportCount: video.brokenReports.length,
      isBroken:    video.isBroken,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/courses/broken-videos  — admin: ver todos los videos rotos ───────
export const getBrokenVideos = async (req, res, next) => {
  try {
    // Cursos que tienen al menos un video marcado como roto o con reportes
    const courses = await Course.find({
      $or: [
        { "videos.isBroken": true },
        { "videos.brokenReports.0": { $exists: true } },
      ],
    })
      .select("title materia videos")
      .lean();

    // Aplanar para devolver una lista de {courseId, courseTitle, video, reportCount}
    const broken = [];
    for (const course of courses) {
      for (const video of course.videos) {
        if (video.isBroken || video.brokenReports?.length > 0) {
          broken.push({
            courseId:    course._id,
            courseTitle: course.title,
            materia:     course.materia,
            video: {
              _id:         video._id,
              youtubeId:   video.youtubeId,
              title:       video.title,
              duration:    video.duration,
              isBroken:    video.isBroken,
              reportCount: video.brokenReports?.length ?? 0,
              reports:     video.brokenReports ?? [],
            },
          });
        }
      }
    }

    // Ordenar: más reportes primero
    broken.sort((a, b) => b.video.reportCount - a.video.reportCount);

    res.status(200).json({ total: broken.length, broken });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/courses/:id/videos/:videoId  — admin: corregir video ───────────
// Permite cambiar el youtubeId o el título del video reportado
export const fixBrokenVideo = async (req, res, next) => {
  try {
    const { id: courseId, videoId } = req.params;
    const { youtubeId, title, duration } = req.body;

    const course = await Course.findById(courseId);
    if (!course) return next(notFound("Curso no encontrado"));

    const video = course.videos.id(videoId);
    if (!video) return next(notFound("Video no encontrado"));

    if (youtubeId !== undefined) video.youtubeId = youtubeId.trim();
    if (title     !== undefined) video.title     = title.trim();
    if (duration  !== undefined) video.duration  = duration.trim();

    // Al corregir, se limpian los reportes y el flag
    video.brokenReports = [];
    video.isBroken      = false;

    await course.save();
    res.status(200).json({ message: "Video actualizado y reportes limpiados", video });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/courses/:id/videos/:videoId  — admin: eliminar video roto ─────
export const deleteVideo = async (req, res, next) => {
  try {
    const { id: courseId, videoId } = req.params;

    const course = await Course.findById(courseId);
    if (!course) return next(notFound("Curso no encontrado"));

    const videoIndex = course.videos.findIndex((v) => v._id.toString() === videoId);
    if (videoIndex === -1) return next(notFound("Video no encontrado"));

    course.videos.splice(videoIndex, 1);
    await course.save();

    res.status(200).json({ message: "Video eliminado del curso" });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/courses/:id/videos/:videoId/reports  — admin: limpiar reportes
export const clearVideoReports = async (req, res, next) => {
  try {
    const { id: courseId, videoId } = req.params;

    const course = await Course.findById(courseId);
    if (!course) return next(notFound("Curso no encontrado"));

    const video = course.videos.id(videoId);
    if (!video) return next(notFound("Video no encontrado"));

    video.brokenReports = [];
    video.isBroken      = false;
    await course.save();

    res.status(200).json({ message: "Reportes limpiados" });
  } catch (err) {
    next(err);
  }
};
