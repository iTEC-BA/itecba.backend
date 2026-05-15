// src/modules/trueketec/trueketec.routes.js
import { Router }                    from "express";
import { body, param, query }        from "express-validator";
import { validate }                  from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import {
  getFeed,
  getMyPosts,
  getMyMatches,
  createPost,
  changeEstado,
  postular,
  getPostulantes,
  acceptMatch,
  deletePost,
  adminGetAll,
  adminDeletePost,
} from "./trueketec.controller.js";

const router = Router();

// ── Constantes de validación ───────────────────────────────────────────────
const TURNOS          = ["Mañana", "Tarde", "Noche"];
const TURNOS_DESEADOS = [...TURNOS, "Cualquiera"];
const ESTADOS_VALIDOS = ["Activo", "En Negociación", "Trueque Realizado"];

// ── Validadores de creación ────────────────────────────────────────────────
const createValidation = [
  body("departamento")
    .trim().notEmpty().withMessage("El departamento es obligatorio.")
    .isLength({ max: 80 }),
  body("materia")
    .trim().notEmpty().withMessage("La materia es obligatoria.")
    .isLength({ max: 150 }),
  body("comision_actual")
    .trim().notEmpty().withMessage("La comisión actual es obligatoria.")
    .matches(/^[A-Za-z0-9]{1,10}$/).withMessage("Formato de comisión inválido.")
    .customSanitizer((v) => v.toUpperCase()),
  body("turno_actual")
    .isIn(TURNOS).withMessage("Turno actual inválido."),
  body("comision_deseada")
    .trim().notEmpty().withMessage("La comisión deseada es obligatoria.")
    .isLength({ max: 20 })
    .customSanitizer((v) => v.toUpperCase()),
  body("turno_deseado")
    .isIn(TURNOS_DESEADOS).withMessage("Turno deseado inválido."),
];

// ── Rutas públicas (autenticadas con cuenta UTN) ───────────────────────────

// Feed principal (filtros opcionales)
router.get("/",
  verifyToken,
  [
    query("page").optional().isInt({ min: 1, max: 9999 }).toInt(),
    query("materia").optional().trim().isLength({ max: 150 }),
    query("departamento").optional().trim().isLength({ max: 80 }),
    query("turno_deseado").optional().isIn([...TURNOS_DESEADOS, ""]),
    query("comision").optional().trim().matches(/^[A-Za-z0-9]{0,10}$/),
  ],
  validate,
  getFeed
);

// Mis publicaciones
router.get("/my-posts",   verifyToken, getMyPosts);

// Mis matches perfectos
router.get("/my-matches", verifyToken, getMyMatches);

// Crear publicación
router.post("/",
  verifyToken,
  createValidation,
  validate,
  createPost
);

// Cambiar estado de MI publicación
router.patch("/:id/estado",
  verifyToken,
  [
    param("id").isMongoId(),
    body("estado").isIn(ESTADOS_VALIDOS).withMessage("Estado inválido."),
  ],
  validate,
  changeEstado
);

// Postularse a un trueque ajeno
router.post("/:id/postular",
  verifyToken,
  [param("id").isMongoId()],
  validate,
  postular
);

// Ver postulantes de MI publicación
router.get("/:id/postulantes",
  verifyToken,
  [param("id").isMongoId()],
  validate,
  getPostulantes
);

// Confirmar match (y revelar emails)
router.post("/:id/accept-match",
  verifyToken,
  [
    param("id").isMongoId(),
    body("targetPostId").isMongoId().withMessage("targetPostId inválido."),
  ],
  validate,
  acceptMatch
);

// Soft-delete de MI publicación
router.delete("/:id",
  verifyToken,
  [param("id").isMongoId()],
  validate,
  deletePost
);

// ── Rutas de administrador ─────────────────────────────────────────────────
router.get("/admin",
  verifyToken, requireAdmin,
  [query("estado").optional().isIn(ESTADOS_VALIDOS)],
  validate,
  adminGetAll
);

router.delete("/admin/:id",
  verifyToken, requireAdmin,
  [param("id").isMongoId()],
  validate,
  adminDeletePost
);

export default router;
