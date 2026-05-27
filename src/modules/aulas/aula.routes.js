// src/modules/aulas/aula.routes.js
import { Router }                    from "express";
import { body, query, param }        from "express-validator";
import multer                        from "multer";
import { validate }                  from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import { FUNCIONES, SEDES }          from "./aula.model.js";
import {
  getAulas,
  getAllAulas,
  getAula,
  createAula,
  updateAula,
  deleteAula,
  uploadMedia,
  deleteMedia, addVideoUrl,
} from "./aula.controller.js";

const router = Router();

// Multer: memoria, solo imágenes, max 5 archivos x 5 MB c/u
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Solo se permiten archivos de imagen"));
    }
    cb(null, true);
  },
});

// ── Públicas ──────────────────────────────────────────────────────────────────
router.get(
  "/",
  [
    query("sede").optional().isIn(SEDES).withMessage("Sede inválida"),
    query("funcion").optional().isIn(FUNCIONES).withMessage("Función inválida"),
  ],
  validate,
  getAulas
);

router.get(
  "/all",
  verifyToken, requireAdmin,
  getAllAulas
);

router.get(
  "/:identificador",
  [param("identificador").notEmpty().withMessage("Identificador requerido")],
  validate,
  getAula
);

// ── Protegidas (solo admin) ───────────────────────────────────────────────────
router.post(
  "/",
  verifyToken, requireAdmin,
  [
    body("numero").trim().notEmpty().withMessage("número es requerido").isLength({ max: 50 }),
    body("sede").isIn(SEDES).withMessage("Sede inválida"),
    body("piso").isInt({ min: -2, max: 30 }).withMessage("Piso inválido").toInt(),
    body("funcion").isIn(FUNCIONES).withMessage("Función inválida"),
    body("pasillo").optional().trim().isLength({ max: 80 }),
    body("ala").optional().trim().isLength({ max: 80 }),
    body("capacidad").optional().isInt({ min: 1 }).toInt(),
    body("carrera").optional().trim().isLength({ max: 100 }),
    body("descripcion").optional().trim().isLength({ max: 5000 }),
    body("referencias").optional().trim().isLength({ max: 5000 }),
    body("videos").optional().isArray({ max: 3 }).withMessage("Máximo 3 videos"),
    body("videos.*").optional().trim().isURL().withMessage("Cada video debe ser una URL válida"),
  ],
  validate,
  createAula
);

router.patch(
  "/:id",
  verifyToken, requireAdmin,
  [
    body("numero").optional().trim().notEmpty().isLength({ max: 50 }),
    body("sede").optional().isIn(SEDES),
    body("piso").optional().isInt({ min: -2, max: 30 }).toInt(),
    body("funcion").optional().isIn(FUNCIONES),
    body("pasillo").optional().trim().isLength({ max: 80 }),
    body("ala").optional().trim().isLength({ max: 80 }),
    body("capacidad").optional().isInt({ min: 1 }).toInt(),
    body("carrera").optional().trim().isLength({ max: 100 }),
    body("descripcion").optional().trim().isLength({ max: 5000 }),
    body("referencias").optional().trim().isLength({ max: 5000 }),
    body("activo").optional().isBoolean().toBoolean(),
    body("videos").optional().isArray({ max: 3 }),
    body("videos.*").optional().trim().isURL(),
  ],
  validate,
  updateAula
);

router.delete("/:id", verifyToken, requireAdmin, deleteAula);

// Subir imágenes (multipart/form-data, campo "imagenes")
router.post(
  "/:id/media",
  verifyToken, requireAdmin,
  upload.array("imagenes", 10),
  uploadMedia
);

// Eliminar imagen o video
router.delete(
  "/:id/media",
  verifyToken, requireAdmin,
  [
    body("tipo").isIn(["imagen", "video"]).withMessage("tipo debe ser 'imagen' o 'video'"),
    body("url").trim().notEmpty().withMessage("url requerida"),
  ],
  validate,
  deleteMedia
);


// Agregar link de video externo (YouTube, Drive, etc.)
router.post(
  "/:id/media/video",
  verifyToken, requireAdmin,
  [
    body("url")
      .trim()
      .notEmpty().withMessage("La URL del video es requerida")
      .isURL({ protocols: ["http", "https"], require_protocol: true })
      .withMessage("Debe ser una URL válida (http o https)"),
  ],
  validate,
  addVideoUrl
);

export default router;
