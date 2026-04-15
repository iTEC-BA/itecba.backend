import Announcement from "./ads.model.js";

export const getActiveAnnouncement = async (req, res, next) => {
  try {
    // 👇 CAMBIO AQUÍ: Usamos find() en lugar de findOne()
    const announcements = await Announcement.find({ active: true })
      .sort({
        createdAt: -1,
      })
      .lean();
    // Ahora announcements siempre será un Array (ej: [] o [{...}])
    res.status(200).json(announcements);
  } catch (error) {
    next(error);
  }
};

export const createAnnouncement = async (req, res, next) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) {
      throw Object.assign(new Error("Título y mensaje son requeridos"), {
        statusCode: 400,
      });
    }

    // Desactivar anuncios anteriores
    await Announcement.updateMany({}, { active: false });

    const newAnnouncement = new Announcement(req.body);
    const savedAnnouncement = await newAnnouncement.save();
    res.status(201).json(savedAnnouncement);
  } catch (error) {
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
