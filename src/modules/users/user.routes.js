import { Router } from "express";
import { body, query } from "express-validator";
import { validate } from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import {
  getUsers,
  getUsersCount,
  getAdminUsers,
  getAuthorizedUsers,
  searchUserByEmail,
  updateUserRole,
  updateUserPoints,
  updateUserProfile,
  createAuthorizedUser,
  updateAuthorizedUser,
  deleteAuthorizedUser,
  deleteUser,
  registerWithEmailPassword,
  getAuthProvider,
} from "./user.controller.js";

const router = Router();

// ── Registro público para excepciones de correo no institucional ──────────────


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
    body("careers").optional().isArray({ max: 5 }),
    body("startYear")
      .optional()
      .isInt({ min: 1990, max: new Date().getFullYear() })
      .toInt(),
    body("phone").optional().trim().isLength({ max: 20 }),
    body("bio").optional().trim().isLength({ max: 300 }),
    body("github").optional().trim().isURL(),
    body("photoURL").optional().trim().isURL(),
  ],
  validate,
  updateUserProfile,
);

// __ITEC_AUTOPATCH_AUTH_PROVIDER_ROUTE__
// ── Consulta pública de proveedor de auth (para mensajes de error en login) ───
router.get(
  "/auth-provider",
  [query("email").isEmail().withMessage("Email inválido")],
  validate,
  getAuthProvider,
);

// ── Todas las rutas siguientes son exclusivas de admin ────────────────────────
router.use(verifyToken, requireAdmin);

router.get("/count", getUsersCount);
router.get("/admins", getAdminUsers);
router.get("/authorized", getAuthorizedUsers);

router.get(
  "/",
  [query("limit").optional().isInt({ min: 1, max: 100 }).toInt()],
  validate,
  getUsers,
);

router.get(
  "/search",
  [query("email").isEmail().withMessage("Email inválido")],
  validate,
  searchUserByEmail,
);

router.post(
  "/authorized",
  [
    body("email").isEmail().withMessage("Email inválido"),
    body("name").optional().trim().isLength({ max: 80 }),
    body("role").optional().trim().equals("student"),
    body("authorized").optional().isBoolean().toBoolean(),
  ],
  validate,
  createAuthorizedUser,
);

router.patch(
  "/authorized/:authorizationId",
  [
    body("email").optional().isEmail().withMessage("Email inválido"),
    body("name").optional().trim().isLength({ max: 80 }),
    body("authorized").optional().isBoolean().toBoolean(),
  ],
  validate,
  updateAuthorizedUser,
);

router.delete("/authorized/:authorizationId", deleteAuthorizedUser);

router.patch(
  "/:uid/role",
  [body("role").trim().notEmpty().withMessage("Rol requerido")],
  validate,
  updateUserRole,
);

router.delete("/:uid", deleteUser);

router.patch(
  "/:uid/points",
  [body("points").isNumeric().withMessage("Puntos debe ser un número")],
  validate,
  updateUserPoints,
);

export default router;
