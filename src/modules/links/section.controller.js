import Link from "./link.model.js";
import LinkSection from "./section.model.js";
import { notFound } from "../../middlewares/errorHandler.js";

export const getSections = async (req, res, next) => {
  try {
    const sections = await LinkSection.find({ isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .lean();
    const links = await Link.find().sort({ order: 1, createdAt: 1 }).lean();
    const grouped = sections.map((section) => ({
      ...section,
      id: section._id,
      links: links
        .filter((link) => String(link.sectionId || "") === String(section._id))
        .map((link) => ({ ...link, id: link._id })),
    }));
    const unassigned = links.filter((link) => !link.sectionId);
    if (unassigned.length) {
      grouped.unshift({
        id: "general",
        title: "Accesos rápidos",
        description: "",
        displayType: "chips",
        audienceRoles: ["all"],
        order: -1,
        links: unassigned.map((link) => ({ ...link, id: link._id })),
      });
    }
    res.status(200).json(grouped);
  } catch (err) {
    next(err);
  }
};

export const getAllSections = async (req, res, next) => {
  try {
    const sections = await LinkSection.find().sort({ order: 1, createdAt: 1 }).lean();
    res.status(200).json(sections);
  } catch (err) {
    next(err);
  }
};

export const createSection = async (req, res, next) => {
  try {
    const section = await LinkSection.create(req.body);
    res.status(201).json(section);
  } catch (err) {
    next(err);
  }
};

export const updateSection = async (req, res, next) => {
  try {
    const section = await LinkSection.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true },
    );
    if (!section) return next(notFound("Sección no encontrada"));
    res.status(200).json(section);
  } catch (err) {
    next(err);
  }
};

export const deleteSection = async (req, res, next) => {
  try {
    const section = await LinkSection.findByIdAndDelete(req.params.id);
    if (!section) return next(notFound("Sección no encontrada"));
    await Link.updateMany({ sectionId: section._id }, { $set: { sectionId: null } });
    res.status(200).json({ message: "Sección eliminada" });
  } catch (err) {
    next(err);
  }
};
