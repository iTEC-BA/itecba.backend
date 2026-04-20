import Course from "./course.model.js";
import youtubedl from "youtube-dl-exec";

export const getCourses = async (req, res, next) => {
  try {
    const courses = await Course.find().sort({ createdAt: -1 }).lean();
    res.status(200).json(courses);
  } catch (error) {
    next(error);
  }
};

export const getCourseById = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      const err = new Error("Curso no encontrado");
      err.statusCode = 404;
      throw err;
    }
    res.status(200).json(course);
  } catch (error) {
    next(error);
  }
};

export const createCourse = async (req, res, next) => {
  try {
    const { title, videos } = req.body;

    // 🔴 VALIDACIÓN: Un curso sin título o sin videos no sirve
    if (!title || !videos || videos.length === 0) {
      const err = new Error(
        "El curso debe tener un título y al menos un video",
      );
      err.statusCode = 400;
      throw err;
    }

    const newCourse = new Course(req.body);
    const savedCourse = await newCourse.save();
    res.status(201).json(savedCourse);
  } catch (error) {
    next(error);
  }
};

export const updateCourse = async (req, res, next) => {
  try {
    const updatedCourse = await Course.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true },
    );
    if (!updatedCourse) {
      const err = new Error("Curso no encontrado para actualizar");
      err.statusCode = 404;
      throw err;
    }
    res.status(200).json(updatedCourse);
  } catch (error) {
    next(error);
  }
};

export const deleteCourse = async (req, res, next) => {
  try {
    await Course.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Curso eliminado" });
  } catch (error) {
    next(error);
  }
};

export const fetchPlaylistDetails = async (req, res, next) => {
  try {
    const { playlistUrl } = req.body;
    if (!playlistUrl) {
      const err = new Error("URL de la playlist es requerida");
      err.statusCode = 400;
      throw err;
    }

    console.log(`⏳ Iniciando scraping de la playlist: ${playlistUrl}`);

    // Ejecutamos yt-dlp mediante el wrapper para extraer metadata en formato JSON
    // flat-playlist asegura que solo extraigamos metadatos rápidamente sin descargar video
    const playlistData = await youtubedl(playlistUrl, {
      dumpSingleJson: true,
      flatPlaylist: true,
      noWarnings: true,
      callHome: false,
      noCheckCertificate: true,
    });

    if (!playlistData || !playlistData.entries) {
      throw new Error("No se pudo extraer información o la playlist está vacía/privada.");
    }

    // Mapeamos los datos para adaptarlos al Schema de Mongoose
    const videos = playlistData.entries.map((item) => {
      // yt-dlp devuelve la duración en segundos, la formateamos a "M:SS" o "H:MM:SS"
      const formatDuration = (seconds) => {
        if (!seconds) return "0:00";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
      };

      return {
        youtubeId: item.id,
        title: item.title,
        duration: formatDuration(item.duration)
      };
    });

    res.status(200).json({
      title: playlistData.title || "Playlist sin título",
      description: playlistData.description || "",
      videos: videos,
    });

  } catch (error) {
    console.error("🚨 Error haciendo scraping con yt-dlp:", error.message);
    // Si falla, pasamos un error claro al middleware global
    const err = new Error("Falló la extracción de videos de YouTube. Revisa si el link es público.");
    err.statusCode = 500;
    next(err);
  }
};
