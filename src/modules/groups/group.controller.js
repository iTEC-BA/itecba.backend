import Group from "./group.model.js";

export const getApprovedGroups = async (req, res, next) => {
  try {
    const groups = await Group.find({ isApproved: true })
      .sort({ createdAt: -1 })
      .lean();

    console.log(
      `✅ Se encontraron ${groups.length} grupos aprobados en MongoDB.`,
    );
    res.status(200).json(groups);
  } catch (error) {
    next(error);
  }
};

export const getPendingGroups = async (req, res, next) => {
  try {
    const groups = await Group.find({ isApproved: false })
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(groups);
  } catch (error) {
    next(error);
  }
};

export const createGroup = async (req, res, next) => {
  try {
    const { materia, link, carrera } = req.body;

    if (!materia || !link || !carrera) {
      const err = new Error("Faltan campos obligatorios para crear el grupo");
      err.statusCode = 400;
      throw err;
    }

    const newGroup = new Group(req.body);
    const savedGroup = await newGroup.save();
    res.status(201).json(savedGroup);
  } catch (error) {
    next(error);
  }
};

export const approveGroup = async (req, res, next) => {
  try {
    console.log(`Aprobando grupo con ID: ${req.params.id}`);
    const group = await Group.findByIdAndUpdate(
      req.params.id,
      { isApproved: true }, // 🔴 IMPORTANTE: Actualizar el Booleano
      { new: true },
    );
    if (!group)
      throw Object.assign(new Error("Grupo no encontrado"), {
        statusCode: 404,
      });
    res.status(200).json(group);
  } catch (error) {
    next(error);
  }
};

export const deleteGroup = async (req, res, next) => {
  try {
    const group = await Group.findByIdAndDelete(req.params.id);
    if (!group)
      throw Object.assign(new Error("Grupo no encontrado"), {
        statusCode: 404,
      });
    res.status(200).json({ message: "Grupo eliminado exitosamente" });
  } catch (error) {
    next(error);
  }
};
