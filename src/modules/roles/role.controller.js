import Role from "./role.model.js";
import { badRequest, notFound } from "../../middlewares/errorHandler.js";
import { clearUserAuthCache } from "../../middlewares/authMiddleware.js";

const SYSTEM_ROLES = [
  { key: "admin", name: "Administrador", description: "Acceso completo al panel.", permissions: ["admin.panel", "users.manage", "roles.manage", "publications.manage", "announcements.manage", "courses.edit", "courses.manage", "resources.manage"], isSystem: true },
  { key: "moderator", name: "Moderador", description: "Acceso completo al panel y a sus funcionalidades.", permissions: ["admin.panel", "users.manage", "roles.manage", "publications.manage", "announcements.manage", "courses.edit", "courses.manage", "resources.manage"], isSystem: true },
  { key: "student", name: "Estudiante", description: "Usuario estudiante.", permissions: [], isSystem: true },
  { key: "ingresante", name: "Ingresante", description: "Usuario ingresante.", permissions: [], isSystem: true },
  { key: "afiliado", name: "Afiliado", description: "Usuario afiliado.", permissions: [], isSystem: true },
  { key: "profesor", name: "Profesor", description: "Usuario profesor.", permissions: [], isSystem: true },
];

export const ensureSystemRoles = async () => {
  await Promise.all(
    SYSTEM_ROLES.map((role) =>
      Role.findOneAndUpdate(
        { key: role.key },
        role.key === "moderator"
          ? { $set: { name: role.name, description: role.description, permissions: role.permissions, isSystem: true } }
          : { $setOnInsert: role },
        { upsert: true },
      ),
    ),
  );
};

export const getRoles = async (req, res, next) => {
  try {
    await ensureSystemRoles();
    res.status(200).json(await Role.find().sort({ key: 1 }).lean());
  } catch (err) {
    next(err);
  }
};

export const createRole = async (req, res, next) => {
  try {
    const { key, name, description = "", permissions = [] } = req.body;
    if (!/^[a-z][a-z0-9._-]{1,49}$/.test(key)) return next(badRequest("La clave del rol es inválida"));
    const role = await Role.create({ key, name, description, permissions, isSystem: false });
    res.status(201).json(role);
  } catch (err) {
    next(err);
  }
};

export const updateRole = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) return next(notFound("Rol no encontrado"));

    if (req.body.key !== undefined) {
      return next(badRequest("La clave de un rol no se puede modificar"));
    }

    const { name, description, permissions } = req.body;
    if (name !== undefined) role.name = name;
    if (description !== undefined) role.description = description;
    if (permissions !== undefined) role.permissions = permissions;

    if (role.key === "admin" && !role.permissions.includes("roles.manage")) {
      role.permissions.push("roles.manage");
    }

    await role.save();
    clearUserAuthCache();
    res.status(200).json(role);
  } catch (err) {
    next(err);
  }
};

export const deleteRole = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) return next(notFound("Rol no encontrado"));
    if (role.isSystem) return next(badRequest("Los roles del sistema no se pueden eliminar"));
    await role.deleteOne();
    res.status(200).json({ message: "Rol eliminado" });
  } catch (err) {
    next(err);
  }
};
