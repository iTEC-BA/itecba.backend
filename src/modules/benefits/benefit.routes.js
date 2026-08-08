import { Router } from "express";
import { body } from "express-validator";
import { validate } from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import {
  getBenefits, getAllBenefits, createBenefit, updateBenefit,
  deleteBenefit, redeemBenefit, getAllRedemptions
} from "./benefit.controller.js";

const router = Router();

router.get("/", getBenefits);
router.post("/redeem", verifyToken, redeemBenefit);

router.get("/all", verifyToken, requireAdmin, getAllBenefits);
router.get("/redemptions", verifyToken, requireAdmin, getAllRedemptions);

router.post(
  "/",
  verifyToken, requireAdmin,
  [
    body("title").trim().notEmpty().withMessage("Título requerido"),
    body("pointsCost").optional().isInt({ min: 0 }),
  ],
  validate,
  createBenefit
);

router.patch("/:id", verifyToken, requireAdmin, updateBenefit);
router.delete("/:id", verifyToken, requireAdmin, deleteBenefit);

export default router;
