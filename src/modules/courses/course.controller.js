// src/modules/courses/course.controller.js
import ytpl                     from "ytpl";
import Course                   from "./course.model.js";
import { notFound, badRequest } from "../../middlewares/errorHandler.js";
import { normalizeStr }         from "../../utils/normalize.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Construye el filtro de búsqueda normalizado para MongoDB */
const buildSearchFilter = (query = {}) => {
  const filter = {};

  // Estado
  // Incluir cursos aprobados O los que no tienen status (documentos legacy)
  filter.$or = [
    { status: "approved" },
    { status: { $exists: false } },
    { status: null },
    { status: "" },
  ];

  // Búsqueda normalizada (sin tildes, sin chars especiales)
  if (query.search?.trim()) {
    const needle = normalizeStr(query.search);
    // Búsqueda por prefijo/substring en el campo _searchable (pre-normalizado)
    filter._searchable = { $regex: needle, $options: "i" };
  }

  // Filtro exacto de materia (se normaliza para comparar)
  if (query.materia?.trim()) {
    filter.materia = { $regex: `^${query.materia.trim()}$`, $options: "i" };
  }

  // Filtro de categoría
  if (query.categoria === "Oficial" || query.categoria === "Comunidad") {
    filter.categoria = query.categoria;
  }

  return filter;
};

/** Parsea parámetros de paginación con valores seguros */
const parsePagination = (query) => {
  const page  = Math.max(1, parseInt(query.page,  10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 50));
  const skip  = (page - 1) * limit;
  return { page, limit, skip };
};

// ── GET /api/courses  — público: cursos aprobados con búsqueda y paginación ──
export const getCourses = async (req, res, next) => {
  try {
    const filter              = buildSearchFilter(req.query);
    const { page, limit, skip } = parsePagination(req.query);

    const [courses, total] = await Promise.all([
      Course.find(filter)
        .select("-videos.brokenReports")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Course.countDocuments(filter),
    ]);

    res.status(200).json({
      courses,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/courses/all  — admin: todos los estados ─────────────────────────
export const getAllCourses = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const search = req.query.search?.trim();
    const filter = {};
    if (search) filter._searchable = { $regex: normalizeStr(search), $options: "i" };

    const [courses, total] = await Promise.all([
      Course.find(filter)
        .select("-videos.brokenReports")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Course.countDocuments(filter),
    ]);

    res.status(200).json({
      courses,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
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
    const { title, description, imageUrl, playlistId, videos, materia, categoria, status } =
      req.body;

    if (!title?.trim() || !videos?.length) {
      return next(badRequest("title y videos son requeridos"));
    }

    const course = await Course.create({
      title:       title.trim(),
      description: description?.trim() ?? "",
      imageUrl:    imageUrl?.trim() ?? "",
      playlistId:  playlistId?.trim() ?? "",
      materia:     materia?.trim() ?? "",
      categoria:   categoria ?? "Comunidad",
      status:      status ?? "approved",
      videos,
      createdBy:   req.user?.uid ?? "",
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

    if (Object.keys(update).length === 0) {
      return next(badRequest("Sin datos para actualizar"));
    }

    // Regenerar _searchable si cambia algún campo relevante
    if (update.title || update.description || update.materia) {
      const existing = await Course.findById(req.params.id).lean();
      if (existing) {
        update._searchable = normalizeStr(
          `${update.title ?? existing.title} ${update.description ?? existing.description} ${update.materia ?? existing.materia}`
        );
      }
    }

    const course = await Course.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });
    if (!course) return next(notFound("Curso no encontrado"));
    res.status(200).json(course);
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/courses/:id/status  — admin ───────────────────────────────────
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
export const fetchPlaylist = async (req, res, next) => {
  try {
    const { playlistUrl } = req.body;
    if (!playlistUrl?.trim()) return next(badRequest("playlistUrl requerida"));

    const playlist = await ytpl(playlistUrl.trim(), { limit: Infinity });

    const videos = playlist.items.map((item) => ({
      youtubeId: item.id,
      title:     item.title,
      duration:  item.duration ?? "0:00",
    }));

    res.status(200).json({ title: playlist.title, videos });
  } catch (err) {
    if (err.message?.includes("private") || err.message?.includes("unavailable")) {
      return next(badRequest("Playlist privada o no disponible"));
    }
    next(err);
  }
};

// ── GET /api/courses/admin/broken-videos  — admin ────────────────────────────
export const getBrokenVideos = async (req, res, next) => {
  try {
    const courses = await Course.find({
      $or: [
        { "videos.isBroken": true },
        { "videos.brokenReports.0": { $exists: true } },
      ],
    })
      .select("title materia videos")
      .lean();

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

    broken.sort((a, b) => b.video.reportCount - a.video.reportCount);

    res.status(200).json({ total: broken.length, broken });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/courses/:id/videos/:videoId/report  — autenticado ──────────────
export const reportBrokenVideo = async (req, res, next) => {
  try {
    const { id: courseId, videoId } = req.params;
    const { reason = "no-reproduce" } = req.body;
    const uid = req.user.uid;

    const VALID = ["no-reproduce", "error-404", "privado", "contenido-incorrecto"];
    if (!VALID.includes(reason)) {
      return next(badRequest(`reason inválido. Valores permitidos: ${VALID.join(", ")}`));
    }

    const course = await Course.findById(courseId);
    if (!course) return next(notFound("Curso no encontrado"));

    const video = course.videos.id(videoId);
    if (!video) return next(notFound("Video no encontrado en este curso"));

    const alreadyReported = video.brokenReports.some((r) => r.reportedBy === uid);
    if (alreadyReported) {
      return res.status(409).json({ message: "Ya reportaste este video." });
    }

    video.brokenReports.push({ reportedBy: uid, reason });

    if (video.brokenReports.length >= 3) video.isBroken = true;

    await course.save();

    res.status(200).json({
      message:     "Reporte enviado. Gracias por colaborar.",
      reportCount: video.brokenReports.length,
      isBroken:    video.isBroken,
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/courses/:id/videos/:videoId  — admin: corregir video ───────────
export const fixBrokenVideo = async (req, res, next) => {
  try {
    const { id: courseId, videoId } = req.params;
    const { youtubeId, title, duration } = req.body;

    const course = await Course.findById(courseId);
    if (!course) return next(notFound("Curso no encontrado"));

    const video = course.videos.id(videoId);
    if (!video) return next(notFound("Video no encontrado"));

    if (youtubeId !== undefined) video.youtubeId    = youtubeId.trim();
    if (title     !== undefined) video.title        = title.trim();
    if (duration  !== undefined) video.duration     = duration.trim();
    video.brokenReports = [];
    video.isBroken      = false;

    await course.save();
    res.status(200).json({ message: "Video actualizado y reportes limpiados", video });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/courses/:id/videos/:videoId  — admin ─────────────────────────
export const deleteVideo = async (req, res, next) => {
  try {
    const { id: courseId, videoId } = req.params;

    const course = await Course.findById(courseId);
    if (!course) return next(notFound("Curso no encontrado"));

    const idx = course.videos.findIndex((v) => v._id.toString() === videoId);
    if (idx === -1) return next(notFound("Video no encontrado"));

    course.videos.splice(idx, 1);
    await course.save();

    res.status(200).json({ message: "Video eliminado del curso" });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/courses/:id/videos/:videoId/reports  — admin ─────────────────
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
