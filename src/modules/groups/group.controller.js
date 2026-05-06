import Group from "./group.model.js";
import { notFound } from "../../middlewares/errorHandler.js";

// GET /api/groups  — públicos y aprobados, con filtros opcionales
export const getApprovedGroups = async (req, res, next) => {
  try {
    const { carrera, materia, nivel } = req.query;
    const filter = { isApproved: true };
    if (carrera) filter.carrera = { $regex: carrera, $options: "i" };
    if (materia) filter.materia = { $regex: materia, $options: "i" };
    if (nivel)   filter.nivel   = nivel;

    const groups = await Group.find(filter).sort({ createdAt: -1 }).lean();
    res.status(200).json(groups);
  } catch (err) {
    next(err);
  }
};

// GET /api/groups/pending  — solo admin
export const getPendingGroups = async (req, res, next) => {
  try {
    const groups = await Group.find({ isApproved: false })
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(groups);
  } catch (err) {
    next(err);
  }
};

// POST /api/groups  — cualquier usuario autenticado puede proponer
export const createGroup = async (req, res, next) => {
  try {
    const doc = await Group.create({
      ...req.body,
      submittedBy: req.user?.uid ?? "anon",
      isApproved:  false,
    });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

// PUT /api/groups/:id/approve  — solo admin
export const approveGroup = async (req, res, next) => {
  try {
    const doc = await Group.findByIdAndUpdate(
      req.params.id,
      { isApproved: true },
      { new: true }
    );
    if (!doc) return next(notFound("Grupo no encontrado"));
    res.status(200).json(doc);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/groups/:id  — solo admin
export const deleteGroup = async (req, res, next) => {
  try {
    const doc = await Group.findByIdAndDelete(req.params.id);
    if (!doc) return next(notFound("Grupo no encontrado"));
    res.status(200).json({ message: "Grupo eliminado" });
  } catch (err) {
    next(err);
  }
};
