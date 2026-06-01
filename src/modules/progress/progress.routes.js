// src/modules/progress/progress.routes.js
import { Router } from "express";
import { body, param } from "express-validator";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { validate }    from "../../middlewares/validate.js";
import {
  getProgress,
  updateSubject,
  bulkSaveProgress,
} from "./progress.controller.js";

const router = Router();
router.use(verifyToken);

const VALID_STATES = ["a", "pr", "promocionada", "r", "c"];
const CURRENT_YEAR = new Date().getFullYear();

const uidParam = param("uid")
  .isString().trim()
  .notEmpty().withMessage("UID requerido")
  .isLength({ max: 128 }).withMessage("UID demasiado largo");

router.get("/:uid", [uidParam], validate, getProgress);

router.patch(
  "/:uid/subject",
  [
    uidParam,
    body("codigo").isString().trim().notEmpty().isLength({ max: 50 }),
    body("state").optional({ nullable: true }).custom((val) => {
      if (val === null || val === "pendiente") return true;
      if (VALID_STATES.includes(val)) return true;
      throw new Error(`Estado inválido. Permitidos: ${VALID_STATES.join(", ")}, null, pendiente`);
    }),
    body("grade").optional({ nullable: true }).isFloat({ min: 1, max: 10 }),
    body("year").optional({ nullable: true }).isInt({ min: 1990, max: CURRENT_YEAR + 1 }),
  ],
  validate,
  updateSubject
);

router.put(
  "/:uid/bulk",
  [
    uidParam,
    body("enrolledCareers").isArray({ max: 3 }),
    body("enrolledCareers.*").isString().trim().notEmpty().isLength({ max: 80 }),
    body("p").isObject(),
    body("activeCareer").optional({ nullable: true }).isString().trim().isLength({ max: 80 }),
  ],
  validate,
  bulkSaveProgress
);

export default router;
