// src/modules/trueketec/trueketec.routes.js
import { Router }                    from "express";
import { body, param, query }        from "express-validator";
import { validate }                  from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import {
  getFeed,
  getMyMatches,
  createPost,
  deletePost,
  acceptMatch,
  adminGetAll,
  adminDeletePost,
} from "./trueketec.controller.js";

const router = Router();

// ── Validadores reutilizables ──────────────────────────────
const TURNOS          = ["Mañana", "Tarde", "Noche"];
const TURNOS_DESEADOS = [...TURNOS, "Cualquiera"];

const createValidation = [
  body("materia")
    .trim().notEmpty().withMessage("La materia es obligatoria.")
    .isLength({ max: 120 }),
  body("comision_actual")
    .trim().notEmpty().withMessage("La comisión actual es obligatoria.")
    .isLength({ max: 20 }),
  body("turno_actual")
    .isIn(TURNOS).withMessage("Turno actual inválido."),
  body("comision_deseada")
    .trim().notEmpty().withMessage("La comisión deseada es obligatoria.")
    .isLength({ max: 20 }),
  body("turno_deseado")
    .isIn(TURNOS_DESEADOS).withMessage("Turno deseado inválido."),
];

// ── Rutas públicas (autenticadas) ──────────────────────────
router.get  ("/",           verifyToken, validate, getFeed);
router.get  ("/my-matches", verifyToken, getMyMatches);
router.post ("/",           verifyToken, createValidation, validate, createPost);
router.delete("/:id",       verifyToken, param("id").isMongoId(), validate, deletePost);
router.post ("/:id/accept-match",
  verifyToken,
  param("id").isMongoId(),
  body("targetPostId").isMongoId().withMessage("targetPostId inválido."),
  validate,
  acceptMatch
);

// ── Rutas de administrador ─────────────────────────────────
router.get   ("/admin",     verifyToken, requireAdmin, adminGetAll);
router.delete("/admin/:id", verifyToken, requireAdmin,
  param("id").isMongoId(), validate, adminDeletePost);

export default router;
