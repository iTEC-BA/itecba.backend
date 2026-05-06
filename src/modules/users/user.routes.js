import { Router }                    from "express";
import { body, query }               from "express-validator";
import { validate }                  from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import {
  getUsers,
  searchUserByEmail,
  updateUserRole,
  updateUserPoints,
} from "./user.controller.js";

const router = Router();

// Todas las rutas de usuarios son exclusivas de admin
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
