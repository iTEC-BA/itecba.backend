import Course   from "./course.model.js";
import youtubedl from "youtube-dl-exec";
import { notFound, badRequest } from "../../middlewares/errorHandler.js";

// GET /api/courses
export const getCourses = async (req, res, next) => {
  try {
    const { categoria, materia, q } = req.query;
    const filter = {};
    if (categoria) filter.categoria = categoria;
    if (materia)   filter.materia   = { $regex: materia, $options: "i" };
    if (q)         filter.title     = { $regex: q, $options: "i" };

    const courses = await Course.find(filter)
      .sort({ createdAt: -1 })
      .select("-videos") // Lista no necesita los videos completos
      .lean();

    res.status(200).json(courses);
  } catch (err) {
    next(err);
  }
};

// GET /api/courses/:id
export const getCourseById = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id).lean();
    if (!course) return next(notFound("Curso no encontrado"));
    res.status(200).json(course);
  } catch (err) {
    next(err);
  }
};

// POST /api/courses
export const createCourse = async (req, res, next) => {
  try {
    const doc = await Course.create(req.body);
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

// PUT /api/courses/:id
export const updateCourse = async (req, res, next) => {
  try {
    // Deshabilitamos __v automático al actualizar
    const doc = await Course.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!doc) return next(notFound("Curso no encontrado"));
    res.status(200).json(doc);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/courses/:id
export const deleteCourse = async (req, res, next) => {
  try {
    const doc = await Course.findByIdAndDelete(req.params.id);
    if (!doc) return next(notFound("Curso no encontrado"));
    res.status(200).json({ message: "Curso eliminado" });
  } catch (err) {
    next(err);
  }
};

// POST /api/courses/fetch-playlist
const formatDuration = (seconds) => {
  if (!seconds) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
};

export const fetchPlaylistDetails = async (req, res, next) => {
  try {
    const { playlistUrl } = req.body;
    if (!playlistUrl) return next(badRequest("URL de playlist requerida"));

    // Timeout de 30s para no bloquear el proceso en free tier
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    let playlistData;
    try {
      playlistData = await youtubedl(playlistUrl, {
        dumpSingleJson:     true,
        flatPlaylist:       true,
        noWarnings:         true,
        callHome:           false,
        noCheckCertificate: true,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!playlistData?.entries?.length) {
      return next(badRequest("Playlist vacía, privada o URL inválida"));
    }

    res.status(200).json({
      title:       playlistData.title       || "Sin título",
      description: playlistData.description || "",
      videos:      playlistData.entries.map(({ id, title, duration }) => ({
        youtubeId: id,
        title:     title || "Sin título",
        duration:  formatDuration(duration),
      })),
    });
  } catch (err) {
    console.error("yt-dlp error:", err.message);
    next(
      Object.assign(
        new Error("No se pudo extraer la playlist. Verificá que sea pública."),
        { statusCode: 502 }
      )
    );
  }
};
