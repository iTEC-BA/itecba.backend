import Announcement from "./ads.model.js";
import { badRequest, notFound } from "../../middlewares/errorHandler.js";
import { broadcastPush } from "../notifications/notification.controller.js";
// GET /api/announcements/active
export const getActiveAnnouncement = async (req, res, next) => {
  try {
    // También depuramos los expirados al vuelo (sin tarea cron separada)
    const now = new Date();
    await Announcement.updateMany(
      { active: true, expiresAt: { $lte: now } },
      { active: false },
    );

    const announcements = await Announcement.find({ active: true })
      .sort({ isCritical: -1, createdAt: -1 })
      .select("-__v")
      .lean();

    res.status(200).json(announcements);
  } catch (err) {
    next(err);
  }
};

// POST /api/announcements
export const createAnnouncement = async (req, res, next) => {
  try {
    const { title, message, hoursActive = 24, isCritical = false } = req.body;
    const expiresAt = new Date(Date.now() + Number(hoursActive) * 3_600_000);

    const doc = await Announcement.create({
      title,
      message,
      isCritical: Boolean(isCritical),
      active: true,
      expiresAt,
    });

    if (isCritical) {
      await broadcastPush({
        title: `📢 ${title}`,
        body: message,
        url: "/",
        source: "news",
        priority: "high",
      });
    }
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/announcements/:id  (desactiva, no borra — para auditoría)
export const deactivateAnnouncement = async (req, res, next) => {
  try {
    const doc = await Announcement.findByIdAndUpdate(
      req.params.id,
      { active: false },
      { new: true },
    );
    if (!doc) return next(notFound("Anuncio no encontrado"));
    res.status(200).json(doc);
  } catch (err) {
    next(err);
  }
};
