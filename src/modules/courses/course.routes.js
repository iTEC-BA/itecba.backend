// src/modules/courses/course.routes.js
// IMPORTANTE: Las rutas estáticas (/admin/*, /fetch-playlist) van ANTES de /:id
// para evitar que Express las interprete como courseId.
import { Router }                    from "express";
import { body, query }               from "express-validator";
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

// ── Públicas ──────────────────────────────────────────────────────────────────
// GET /api/courses?search=analisis&materia=X&categoria=Oficial&page=1&limit=9
router.get(
  "/",
  [
    query("search").optional().trim().isLength({ max: 100 }),
    query("materia").optional().trim(),
    query("categoria").optional().isIn(["Oficial", "Comunidad", ""]),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 50 }),
  ],
  validate,
  getCourses
);

// ── Admin: rutas estáticas (DEBEN ir ANTES de /:id) ──────────────────────────
// FIX: sin este orden, "admin/broken-videos" sería capturado por /:id
router.get(
  "/admin/all",
  verifyToken, requireAdmin,
  getAllCourses
);

router.get(
  "/admin/broken-videos",
  verifyToken, requireAdmin,
  getBrokenVideos
);

router.post(
  "/fetch-playlist",
  verifyToken, requireAdmin,
  [body("playlistUrl").trim().notEmpty().withMessage("playlistUrl requerida")],
  validate,
  fetchPlaylist
);

// ── Admin: CRUD general ───────────────────────────────────────────────────────
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

// ── Rutas con :id (SIEMPRE al final para no colisionar) ──────────────────────
router.get("/:id", getCourseById);

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

// ── Admin: gestión de videos en curso ─────────────────────────────────────────
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

// ── Autenticado: reportar video ───────────────────────────────────────────────
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
