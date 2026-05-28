// src/modules/faq/faq.routes.js
import express                           from "express";
import { body, param, query }            from "express-validator";
import { validate }                      from "../../middlewares/validate.js";
import { verifyToken, requireAdmin }     from "../../middlewares/authMiddleware.js";
import ctrl                              from "./faq.controller.js";

const router = express.Router();

// ── Públicas ──────────────────────────────────────────────────────────────────
router.get("/",       ctrl.getAll);
router.get("/top",    ctrl.getTop);

router.get(
  "/search",
  [query("q").trim().notEmpty().withMessage("El parámetro q es requerido")],
  validate,
  ctrl.search,
);

router.patch(
  "/:id/use",
  [param("id").isMongoId().withMessage("ID inválido")],
  validate,
  ctrl.trackUse,
);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.post(
  "/",
  verifyToken, requireAdmin,
  [
    body("question")
      .trim()
      .notEmpty().withMessage("question es requerido")
      .isLength({ min: 5, max: 500 }).withMessage("question debe tener entre 5 y 500 caracteres"),
    body("answer")
      .trim()
      .notEmpty().withMessage("answer es requerido")
      .isLength({ min: 5, max: 3000 }).withMessage("answer debe tener entre 5 y 3000 caracteres"),
    body("category")
      .optional()
      .trim()
      .isLength({ max: 80 }).withMessage("category máx. 80 caracteres"),
    body("keywords")
      .optional()
      .isArray().withMessage("keywords debe ser un array"),
    body("keywords.*")
      .optional()
      .trim()
      .isLength({ max: 60 }),
    body("isActive")
      .optional()
      .isBoolean().toBoolean(),
  ],
  validate,
  ctrl.create,
);

router.patch(
  "/:id",
  verifyToken, requireAdmin,
  [
    param("id").isMongoId().withMessage("ID inválido"),
    body("question")
      .optional()
      .trim()
      .notEmpty()
      .isLength({ min: 5, max: 500 }),
    body("answer")
      .optional()
      .trim()
      .notEmpty()
      .isLength({ min: 5, max: 3000 }),
    body("category").optional().trim().isLength({ max: 80 }),
    body("keywords").optional().isArray(),
    body("keywords.*").optional().trim().isLength({ max: 60 }),
    body("isActive").optional().isBoolean().toBoolean(),
  ],
  validate,
  ctrl.update,
);

router.delete(
  "/:id",
  verifyToken, requireAdmin,
  [param("id").isMongoId().withMessage("ID inválido")],
  validate,
  ctrl.delete,
);

export default router;
