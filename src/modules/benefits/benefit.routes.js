import { Router } from "express";
import { body, query } from "express-validator";
import { validate } from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import {
  getBenefits,
  getAllBenefits,
  createBenefit,
  updateBenefit,
  deleteBenefit,
} from "./benefit.controller.js";

const router = Router();

// Público
router.get("/", getBenefits);

// Admin
router.get("/all", verifyToken, requireAdmin, getAllBenefits);
router.post(
  "/",
  verifyToken,
  requireAdmin,
  [
    body("title").trim().notEmpty().withMessage("Título requerido"),
    body("discount").trim().notEmpty().withMessage("Descuento requerido"),
    body("category").isIn(["medrano", "campus", "digital"]).withMessage("Categoría inválida"),
  ],
  validate,
  createBenefit
);
router.patch("/:id", verifyToken, requireAdmin, updateBenefit);
router.delete("/:id", verifyToken, requireAdmin, deleteBenefit);

export default router;
