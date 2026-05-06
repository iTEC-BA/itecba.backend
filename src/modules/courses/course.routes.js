import { Router }                    from "express";
import { body }                      from "express-validator";
import { validate }                  from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  fetchPlaylistDetails,
} from "./course.controller.js";

const router = Router();

const courseValidators = [
  body("title").trim().notEmpty().withMessage("Título requerido"),
  body("description").trim().notEmpty().withMessage("Descripción requerida"),
  body("imageUrl").trim().isURL().withMessage("imageUrl debe ser una URL válida"),
  body("videos").isArray({ min: 1 }).withMessage("Debe tener al menos un video"),
];

router.get("/",      getCourses);
router.get("/:id",   getCourseById);

router.post(
  "/fetch-playlist",
  verifyToken, requireAdmin,
  [body("playlistUrl").trim().isURL().withMessage("URL inválida")],
  validate,
  fetchPlaylistDetails
);

router.post(
  "/",
  verifyToken, requireAdmin,
  courseValidators, validate,
  createCourse
);

router.put(
  "/:id",
  verifyToken, requireAdmin,
  courseValidators, validate,
  updateCourse
);

router.delete("/:id", verifyToken, requireAdmin, deleteCourse);

export default router;
