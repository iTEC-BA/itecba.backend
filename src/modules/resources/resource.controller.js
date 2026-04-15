import Resource from "./resource.model.js";

export const getApprovedResources = async (req, res, next) => {
  try {
    // 🔴 CORRECCIÓN: Buscamos isApproved: true
    const resources = await Resource.find({ isApproved: true })
      .sort({
        createdAt: -1,
      })
      .lean();
    res.status(200).json(resources);
  } catch (error) {
    next(error);
  }
};

export const getPendingResources = async (req, res, next) => {
  try {
    // 🔴 CORRECCIÓN: Buscamos isApproved: false
    const resources = await Resource.find({ isApproved: false })
      .sort({
        createdAt: -1,
      })
      .lean();
    res.status(200).json(resources);
  } catch (error) {
    next(error);
  }
};

export const createResource = async (req, res, next) => {
  try {
    const { title, carrera, nivel, materia, tipo, formato, link } = req.body;

    // 🔴 VALIDACIÓN: Tu modelo exige todos estos campos, si falta uno crashea
    if (
      !title ||
      !carrera ||
      !nivel ||
      !materia ||
      !tipo ||
      !formato ||
      !link
    ) {
      const err = new Error(
        "Faltan campos obligatorios (title, carrera, nivel, materia, tipo, formato, link)",
      );
      err.statusCode = 400; // Bad Request
      throw err;
    }

    const newResource = new Resource(req.body);
    const savedResource = await newResource.save();
    res.status(201).json(savedResource);
  } catch (error) {
    next(error);
  }
};

export const approveResource = async (req, res, next) => {
  try {
    // 🔴 CORRECCIÓN: Actualizamos isApproved a true
    const resource = await Resource.findByIdAndUpdate(
      req.params.id,
      { isApproved: true },
      { new: true },
    );
    if (!resource) {
      const err = new Error("Aporte no encontrado");
      err.statusCode = 404;
      throw err;
    }
    res.status(200).json(resource);
  } catch (error) {
    next(error);
  }
};

export const deleteResource = async (req, res, next) => {
  try {
    const resource = await Resource.findByIdAndDelete(req.params.id);
    if (!resource) {
      const err = new Error("Aporte no encontrado");
      err.statusCode = 404;
      throw err;
    }
    res.status(200).json({ message: "Aporte eliminado exitosamente" });
  } catch (error) {
    next(error);
  }
};
