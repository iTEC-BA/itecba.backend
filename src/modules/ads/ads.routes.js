import { Router }                       from "express";
import { body }                         from "express-validator";
import { validate }                     from "../../middlewares/validate.js";
import { verifyToken, requireAdmin }    from "../../middlewares/authMiddleware.js";
import {
  getActiveAnnouncement,
  createAnnouncement,
  deactivateAnnouncement,
} from "./ads.controller.js";

const router = Router();

router.get("/active", getActiveAnnouncement);

router.post(
  "/",
  verifyToken, requireAdmin,
  [
    body("title").trim().notEmpty().withMessage("Título requerido").isLength({ max: 120 }),
    body("message").trim().notEmpty().withMessage("Mensaje requerido").isLength({ max: 500 }),
    body("hoursActive").optional().isInt({ min: 1, max: 168 }).toInt(),
    body("isCritical").optional().isBoolean().toBoolean(),
  ],
  validate,
  createAnnouncement
);

router.delete("/:id", verifyToken, requireAdmin, deactivateAnnouncement);

export default router;
