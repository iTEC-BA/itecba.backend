import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../../middlewares/validate.js";
import { verifyToken, requireAnyPermission, requirePermission } from "../../middlewares/authMiddleware.js";
import { getRoles, createRole, updateRole, deleteRole } from "./role.controller.js";

const router = Router();
const roleValidation = [
  body("key").optional().trim().matches(/^[a-z][a-z0-9._-]{1,49}$/),
  body("name").optional().trim().notEmpty(),
  body("description").optional().isString(),
  body("permissions").optional().isArray().custom((permissions) =>
    permissions.every((permission) => typeof permission === "string" && /^[a-z][a-z0-9._-]{1,79}$/.test(permission)),
  ),
];

router.get("/me", verifyToken, (req, res) => res.status(200).json({
  role: req.user.role,
  permissions: req.user.permissions || [],
}));
router.get("/", verifyToken, requireAnyPermission("roles.manage", "users.manage"), getRoles);
router.use(verifyToken, requirePermission("roles.manage"));
router.post("/", [body("key").trim().notEmpty(), body("name").trim().notEmpty(), body("permissions").optional().isArray(), ...roleValidation, validate], createRole);
router.put("/:id", [...roleValidation, validate], updateRole);
router.delete("/:id", deleteRole);

export default router;
