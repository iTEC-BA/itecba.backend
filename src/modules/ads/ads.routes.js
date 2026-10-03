import { Router }                       from "express";
import { body }                         from "express-validator";
import { validate }                     from "../../middlewares/validate.js";
import { optionalVerifyToken, verifyToken, requirePermission }    from "../../middlewares/authMiddleware.js";
import {
  getActiveAnnouncement,
  getAllActiveAnnouncements,
  createAnnouncement,
  deactivateAnnouncement,
} from "./ads.controller.js";

const router = Router();

router.get("/active", optionalVerifyToken, getActiveAnnouncement);
router.get("/manage", verifyToken, requirePermission("announcements.manage"), getAllActiveAnnouncements);

router.post(
  "/",
  verifyToken, requirePermission("announcements.manage"),
  [
    body("title").trim().notEmpty().withMessage("Título requerido").isLength({ max: 120 }),
    body("message").trim().notEmpty().withMessage("Mensaje requerido").isLength({ max: 500 }),
    body("hoursActive").optional().isInt({ min: 1, max: 168 }).toInt(),
    body("isCritical").optional().isBoolean().toBoolean(),
    body("audienceRoles").optional().isArray(),
    body("audienceCareers").optional().isArray(),
  ],
  validate,
  createAnnouncement
);

router.delete("/:id", verifyToken, requirePermission("announcements.manage"), deactivateAnnouncement);

export default router;
