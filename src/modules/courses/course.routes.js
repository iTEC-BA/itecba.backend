// src/modules/courses/course.routes.js
import { Router }                    from "express";
import { body, param }               from "express-validator";
import { validate }                  from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import {
  getCourses,
  getAllCourses,
  getCourseById,
  createCourse,
  updateCourse,
  updateCourseStatus,
  deleteCourse,
  fetchPlaylist,
  reportBrokenVideo,
  getBrokenVideos,
  fixBrokenVideo,
  deleteVideo,
  clearVideoReports,
} from "./course.controller.js";

const router = Router();

// ── Públicas ─────────────────────────────────────────────────────────────────
router.get("/",     getCourses);       // Cursos aprobados (catálogo estudiantes)
router.get("/:id",  getCourseById);    // Detalle de curso

// ── Admin: gestión general ────────────────────────────────────────────────────
router.get(
  "/admin/all",
  verifyToken, requireAdmin,
  getAllCourses
);

router.post(
  "/",
  verifyToken, requireAdmin,
  [
    body("title").trim().notEmpty().withMessage("title requerido"),
    body("videos").isArray({ min: 1 }).withMessage("Se requiere al menos 1 video"),
    body("categoria").optional().isIn(["Oficial", "Comunidad"]),
    body("status").optional().isIn(["draft", "approved", "archived"]),
  ],
  validate,
  createCourse
);

router.put(
  "/:id",
  verifyToken, requireAdmin,
  updateCourse
);

router.patch(
  "/:id/status",
  verifyToken, requireAdmin,
  [body("status").isIn(["draft", "approved", "archived"]).withMessage("status inválido")],
  validate,
  updateCourseStatus
);

router.delete(
  "/:id",
  verifyToken, requireAdmin,
  deleteCourse
);

// ── Admin: playlist de YouTube ─────────────────────────────────────────────────
router.post(
  "/fetch-playlist",
  verifyToken, requireAdmin,
  [body("playlistUrl").trim().notEmpty().withMessage("playlistUrl requerida")],
  validate,
  fetchPlaylist
);

// ── Admin: gestión de videos rotos ────────────────────────────────────────────
router.get(
  "/admin/broken-videos",
  verifyToken, requireAdmin,
  getBrokenVideos
);

router.patch(
  "/:id/videos/:videoId",
  verifyToken, requireAdmin,
  fixBrokenVideo
);

router.delete(
  "/:id/videos/:videoId",
  verifyToken, requireAdmin,
  deleteVideo
);

router.delete(
  "/:id/videos/:videoId/reports",
  verifyToken, requireAdmin,
  clearVideoReports
);

// ── Autenticado: reportar video roto ──────────────────────────────────────────
router.post(
  "/:id/videos/:videoId/report",
  verifyToken,
  [
    body("reason")
      .optional()
      .isIn(["no-reproduce", "error-404", "privado", "contenido-incorrecto"])
      .withMessage("reason inválido"),
  ],
  validate,
  reportBrokenVideo
);

export default router;
