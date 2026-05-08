import { Router }                    from "express";
import { body, query }               from "express-validator";
import { validate }                  from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import {
  getUsers,
  searchUserByEmail,
  updateUserRole,
  updateUserPoints,
  updateUserProfile,
} from "./user.controller.js";

const router = Router();

// ── Ruta del propio usuario (solo verifyToken, SIN requireAdmin) ──────────────
// IMPORTANTE: debe definirse ANTES del router.use(requireAdmin) de abajo
router.patch(
  "/:uid/profile",
  verifyToken,
  [
    body("displayName").optional().trim().isLength({ max: 80 }),
    body("dni").optional().trim().isLength({ max: 20 }),
    body("legajo").optional().trim().isLength({ max: 20 }),
    body("specialty").optional().trim().isLength({ max: 80 }),
    body("careers").optional().isArray({ max: 2 }),
    body("startYear")
      .optional()
      .isInt({ min: 1990, max: new Date().getFullYear() })
      .toInt(),
    body("phone").optional().trim().isLength({ max: 20 }),
    body("photoURL").optional().trim().isURL(),
  ],
  validate,
  updateUserProfile
);

// ── Todas las rutas siguientes son exclusivas de admin ────────────────────────
router.use(verifyToken, requireAdmin);

router.get(
  "/",
  [query("limit").optional().isInt({ min: 1, max: 100 }).toInt()],
  validate,
  getUsers
);

router.get(
  "/search",
  [query("email").isEmail().withMessage("Email inválido")],
  validate,
  searchUserByEmail
);

router.patch(
  "/:uid/role",
  [body("role").trim().notEmpty().withMessage("Rol requerido")],
  validate,
  updateUserRole
);

router.patch(
  "/:uid/points",
  [body("points").isNumeric().withMessage("Puntos debe ser un número")],
  validate,
  updateUserPoints
);

export default router;
