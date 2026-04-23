import Announcement from "./ads.model.js";

export const getActiveAnnouncement = async (req, res, next) => {
  try {
    const announcements = await Announcement.find({ active: true })
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(announcements);
  } catch (error) {
    next(error);
  }
};

export const createAnnouncement = async (req, res, next) => {
  try {
    console.log("📥 Recibiendo petición para crear aviso:", req.body); // Log de depuración
    const { title, message, hoursActive, isCritical } = req.body;

    if (!title || !message) {
      console.error("❌ Faltan datos requeridos (title, message)");
      throw Object.assign(new Error("Título y mensaje son requeridos"), {
        statusCode: 400,
      });
    }

    const validHours = Number(hoursActive) || 24;
    const expiresAt = new Date(Date.now() + validHours * 60 * 60 * 1000);

    const newAnnouncement = new Announcement({
      title,
      message,
      active: true,
      isCritical: Boolean(isCritical),
      expiresAt,
    });

    const savedAnnouncement = await newAnnouncement.save();
    console.log("✅ Aviso guardado correctamente:", savedAnnouncement._id);
    res.status(201).json(savedAnnouncement);
  } catch (error) {
    console.error("❌ Error en createAnnouncement (Backend):", error);
    next(error);
  }
};

export const deactivateAnnouncement = async (req, res, next) => {
  try {
    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      { active: false },
      { new: true },
    );
    if (!announcement)
      throw Object.assign(new Error("Anuncio no encontrado"), {
        statusCode: 404,
      });
    res.status(200).json(announcement);
  } catch (error) {
    next(error);
  }
};
