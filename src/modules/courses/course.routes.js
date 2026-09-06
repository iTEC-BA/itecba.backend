import multer from "multer";
import { Router }                    from "express";
import { body, query }               from "express-validator";
import { validate }                  from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import {
  getCourses, getAllCourses, getCourseById, createCourse, updateCourse,
  updateCourseStatus, deleteCourse, fetchPlaylist, reportBrokenVideo,
  getBrokenVideos, fixBrokenVideo, deleteVideo, clearVideoReports, migrateLegacyCourses, uploadCover
} from "./course.controller.js";

const router = Router();

router.get("/", [
    query("search").optional().trim().isLength({ max: 100 }),
    query("materia").optional().trim(),
    query("categoria").optional().isIn(["Oficial", "Comunidad", ""]),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 50 }),
  ], validate, getCourses);

router.get("/admin/all", verifyToken, requireAdmin, getAllCourses);
router.get("/admin/broken-videos", verifyToken, requireAdmin, getBrokenVideos);
// FIX: esta ruta encadenaba por error el middleware `uploadCover` (que espera
// un archivo multipart y ya no se ejecutaba porque migrateLegacyCourses corta
// la respuesta antes). Se deja únicamente el handler de la migración.
router.post("/admin/migrate-legacy", verifyToken, requireAdmin, migrateLegacyCourses);

router.post("/fetch-playlist", verifyToken, requireAdmin, [
    body("playlistUrl").trim().notEmpty().withMessage("playlistUrl requerida")
  ], validate, fetchPlaylist);

// CORRECCIÓN: Validación adaptada a la jerarquía de secciones
router.post("/", verifyToken, requireAdmin, [
    body("title").trim().notEmpty().withMessage("title requerido"),
    body("sections").isArray({ min: 1 }).withMessage("Se requiere al menos 1 sección con lecciones"),
    body("categoria").optional().isIn(["Oficial", "Comunidad"]),
    body("status").optional().isIn(["draft", "approved", "archived"]),
    // NUEVO: permite declarar uno o más profesores al crear el curso.
    body("profesores").optional().isArray().withMessage("profesores debe ser un array de nombres"),
  ], validate, createCourse);

router.get("/:id", getCourseById);
router.put("/:id", verifyToken, requireAdmin, [
    body("profesores").optional().isArray().withMessage("profesores debe ser un array de nombres"),
  ], validate, updateCourse);

router.patch("/:id/status", verifyToken, requireAdmin, [
    body("status").isIn(["draft", "approved", "archived"]).withMessage("status inválido")
  ], validate, updateCourseStatus);

router.delete("/:id", verifyToken, requireAdmin, deleteCourse);
router.patch("/:id/videos/:videoId", verifyToken, requireAdmin, fixBrokenVideo);
router.delete("/:id/videos/:videoId", verifyToken, requireAdmin, deleteVideo);
router.delete("/:id/videos/:videoId/reports", verifyToken, requireAdmin, clearVideoReports);

router.post("/:id/videos/:videoId/report", verifyToken, [
    body("reason").optional().isIn(["no-reproduce", "error-404", "privado", "contenido-incorrecto"]).withMessage("reason inválido"),
  ], validate, reportBrokenVideo);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post("/upload-cover", verifyToken, requireAdmin, upload.single("cover"), uploadCover);

export default router;
