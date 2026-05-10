import { Benefit } from "./benefit.model.js";
import { badRequest, notFound } from "../../middlewares/errorHandler.js";
import { broadcastPush } from "../notifications/notification.controller.js";

// GET /api/benefits — público
export const getBenefits = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    filter.isActive = true;
    const benefits = await Benefit.find(filter).sort({
      order: 1,
      createdAt: -1,
    });
    res.status(200).json({ benefits });
  } catch (err) {
    next(err);
  }
};

// GET /api/benefits/all — admin (incluye inactivos)
export const getAllBenefits = async (req, res, next) => {
  try {
    const benefits = await Benefit.find().sort({ category: 1, order: 1 });
    res.status(200).json({ benefits });
  } catch (err) {
    next(err);
  }
};

// POST /api/benefits — admin
export const createBenefit = async (req, res, next) => {
  try {
    const { title, discount, location, category, description, logoUrl, order } =
      req.body;
    if (!title || !discount || !category)
      return next(badRequest("title, discount y category son requeridos"));
    const benefit = await Benefit.create({
      title,
      discount,
      location,
      category,
      description,
      logoUrl,
      order: order || 0,
    });
    // Al final de createBenefit():
    await broadcastPush({
      title: "🎁 Nuevo beneficio disponible",
      body: `${title} — Descuento exclusivo para estudiantes iTEC`,
      url: "/perfil",
      source: "benefits",
      priority: "normal",
    });
    res.status(201).json({ benefit });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/benefits/:id — admin
export const updateBenefit = async (req, res, next) => {
  try {
    const benefit = await Benefit.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!benefit) return next(notFound("Beneficio no encontrado"));
    res.status(200).json({ benefit });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/benefits/:id — admin (soft delete)
export const deleteBenefit = async (req, res, next) => {
  try {
    const benefit = await Benefit.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );
    if (!benefit) return next(notFound("Beneficio no encontrado"));
    res.status(200).json({ message: "Beneficio desactivado", benefit });
  } catch (err) {
    next(err);
  }
};
