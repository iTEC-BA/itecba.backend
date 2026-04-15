import Course from "./course.model.js";
import ytpl from "ytpl"; // 🔴 ¡AQUÍ ESTÁ LA MAGIA QUE FALTABA!

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
    // Usamos ytpl para hacer scraping de la playlist (límite de 50 videos)
    const playlist = await ytpl(playlistUrl, { limit: 300 });

    // Mapeamos los datos para que tengan el formato exacto de tu base de datos
    const videos = playlist.items.map((item) => ({
      youtubeId: item.id,
      title: item.title,
      duration: item.duration || "0:00",
    }));

    // Devolvemos el título de la playlist y sus videos
    res.json({
      title: playlist.title,
      videos: videos,
    });
    // AQUI: Lógica que ya tenías para extraer videos usando tu API_KEY de Google/YouTube
    // Como no veo tu lógica interna de YouTube en el snippet, asegúrate de pegarla aquí.
    // ...
    // res.status(200).json({ title: 'Título', videos: [...] });
  } catch (error) {
    next(error);
  }
};
