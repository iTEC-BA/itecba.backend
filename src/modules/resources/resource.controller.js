import Resource from "./resource.model.js";
import { notFound } from "../../middlewares/errorHandler.js";

// GET /api/resources
export const getApprovedResources = async (req, res, next) => {
  try {
    const { carrera, materia, nivel, tipo, formato } = req.query;
    const filter = { isApproved: true };
    if (carrera) filter.carrera = { $regex: carrera, $options: "i" };
    if (materia) filter.materia = { $regex: materia, $options: "i" };
    if (nivel)   filter.nivel   = nivel;
    if (tipo)    filter.tipo     = tipo;
    if (formato) filter.formato  = formato;

    const resources = await Resource.find(filter)
      .sort({ createdAt: -1 })
      .select("-__v")
      .lean();

    res.status(200).json(resources);
  } catch (err) {
    next(err);
  }
};

// GET /api/resources/pending
export const getPendingResources = async (req, res, next) => {
  try {
    const resources = await Resource.find({ isApproved: false })
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(resources);
  } catch (err) {
    next(err);
  }
};

// POST /api/resources
export const createResource = async (req, res, next) => {
  try {
    const doc = await Resource.create({
      ...req.body,
      submittedBy: req.user?.uid ?? "anon",
      isApproved: false,
    });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

// PUT /api/resources/:id/approve
export const approveResource = async (req, res, next) => {
  try {
    const doc = await Resource.findByIdAndUpdate(
      req.params.id,
      { isApproved: true },
      { new: true }
    );
    if (!doc) return next(notFound("Aporte no encontrado"));
    res.status(200).json(doc);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/resources/:id
export const deleteResource = async (req, res, next) => {
  try {
    const doc = await Resource.findByIdAndDelete(req.params.id);
    if (!doc) return next(notFound("Aporte no encontrado"));
    res.status(200).json({ message: "Aporte eliminado" });
  } catch (err) {
    next(err);
  }
};
