// src/modules/points/points.routes.js
import { Router }                    from "express";
import { body, param }               from "express-validator";
import { validate }                  from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import {
  getPublicActivities,
  getAdminActivities,
  updateActivity,
  grantPointsEndpoint,
  getHistory,
} from "./points.controller.js";

const router = Router();

// Públicas ────────────────────────────────────────────────────────────────────
router.get("/activities", getPublicActivities);

// Admin ───────────────────────────────────────────────────────────────────────
router.get(
  "/activities/admin",
  verifyToken, requireAdmin,
  getAdminActivities,
);

router.patch(
  "/activities/:id",
  verifyToken, requireAdmin,
  [
    param("id").isMongoId().withMessage("ID inválido"),
    body("points").optional().isInt({ min: 0 }).toInt(),
    body("cooldownMinutes").optional().isInt({ min: 0 }).toInt(),
    body("dailyCap").optional().isInt({ min: 0 }).toInt(),
    body("isActive").optional().isBoolean().toBoolean(),
    body("name").optional().trim().isLength({ min: 1, max: 120 }),
    body("description").optional().trim().isLength({ max: 500 }),
  ],
  validate,
  updateActivity,
);

// Autenticados ────────────────────────────────────────────────────────────────
router.post(
  "/grant",
  verifyToken,
  [
    body("activityKey").trim().notEmpty().withMessage("activityKey requerido"),
    body("context").optional().isObject(),
  ],
  validate,
  grantPointsEndpoint,
);

router.get("/history", verifyToken, getHistory);

export default router;
