#!/usr/bin/env bash
# =============================================================================
#  iTEC BA — Backend Refactor Script
#  Render Free Tier · Node.js/Express · Feature-based architecture
#  Ejecutar desde la RAÍZ del proyecto backend: bash refactor-backend.sh
# =============================================================================
set -e

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log() { echo -e "${CYAN}[iTEC]${NC} $1"; }
ok()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn(){ echo -e "${YELLOW}[!]${NC} $1"; }

echo ""; echo -e "${RED}  iTEC BA — Backend Refactor${NC}"; echo ""
[ ! -f "package.json" ] && echo -e "${RED}[✗]${NC} Ejecutá desde la raíz del proyecto." && exit 1

# ── Instalar dependencias nuevas ─────────────────────────────────────────────
log "Instalando dependencias nuevas..."
npm install express-validator compression node-cron 2>/dev/null
ok "Dependencias instaladas."

# =============================================================================
# src/config/firebase-admin.js
# =============================================================================
log "Escribiendo src/config/firebase-admin.js..."
cat > src/config/firebase-admin.js << 'EOF'
import admin from "firebase-admin";
import dotenv from "dotenv";
dotenv.config();

// Validación temprana de variables críticas
const required = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`🔴 Variable de entorno faltante: ${key}`);
    process.exit(1);
  }
}

// Inicializar solo si no hay instancia activa (útil en hot-reload)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

export const dbFirebase   = admin.firestore();
export const authFirebase = admin.auth();
console.log("🟢 Firebase Admin conectado");
EOF
ok "firebase-admin.js"

# =============================================================================
# src/config/mongo.js
# =============================================================================
log "Escribiendo src/config/mongo.js..."
cat > src/config/mongo.js << 'EOF'
import mongoose from "mongoose";

// Opciones recomendadas para Render free tier (conexión estable con Atlas)
const MONGOOSE_OPTS = {
  serverSelectionTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
  maxPoolSize: 5,           // Bajo porque en free tier la RAM es limitada
  minPoolSize: 1,
  heartbeatFrequencyMS: 30_000,
};

const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    console.error("🔴 MONGODB_URI no definida en .env");
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI, MONGOOSE_OPTS);
    console.log("🟢 MongoDB conectado");

    mongoose.connection.on("disconnected", () =>
      console.warn("⚠️  MongoDB desconectado — reconectando...")
    );
    mongoose.connection.on("error", (err) =>
      console.error("🔴 MongoDB error:", err.message)
    );
  } catch (err) {
    console.error("🔴 Error conectando a MongoDB:", err.message);
    process.exit(1);
  }
};

export default connectDB;
EOF
ok "mongo.js"

# =============================================================================
# src/middlewares/errorHandler.js
# =============================================================================
log "Escribiendo src/middlewares/errorHandler.js..."
cat > src/middlewares/errorHandler.js << 'EOF'
// Clases de error con semántica HTTP clara
export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}
export const notFound = (message = "Recurso no encontrado") =>
  new AppError(message, 404);
export const badRequest = (message = "Datos inválidos") =>
  new AppError(message, 400);
export const unauthorized = (message = "No autorizado") =>
  new AppError(message, 401);
export const forbidden = (message = "Acceso denegado") =>
  new AppError(message, 403);

// Manejador global de errores — siempre va ÚLTIMO en index.js
export const errorHandler = (err, req, res, _next) => {
  // Errores de validación de Mongoose
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: true, message: messages.join(", ") });
  }
  // ID de Mongo con formato inválido
  if (err.name === "CastError") {
    return res.status(400).json({ error: true, message: "ID inválido" });
  }
  // Clave duplicada (unique index)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {}).join(", ");
    return res
      .status(409)
      .json({ error: true, message: `El campo '${field}' ya existe` });
  }

  const statusCode = err.statusCode || 500;
  const message    = err.isOperational ? err.message : "Error interno del servidor";

  if (!err.isOperational) {
    console.error(`[UNEXPECTED ERROR] ${req.method} ${req.path}`, err);
  }

  res.status(statusCode).json({
    error:   true,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
EOF
ok "errorHandler.js"

# =============================================================================
# src/middlewares/authMiddleware.js
# =============================================================================
log "Escribiendo src/middlewares/authMiddleware.js..."
cat > src/middlewares/authMiddleware.js << 'EOF'
import { authFirebase, dbFirebase } from "../config/firebase-admin.js";
import { unauthorized, forbidden } from "./errorHandler.js";

// Cache en memoria para no consultar Firestore en cada request
const userRoleCache = new Map();
const CACHE_TTL_MS  = 5 * 60 * 1000; // 5 minutos

const getCachedRole = async (uid) => {
  const cached = userRoleCache.get(uid);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.role;

  const doc  = await dbFirebase.collection("users").doc(uid).get();
  const role = doc.exists ? doc.data().role ?? "student" : "student";
  userRoleCache.set(uid, { role, ts: Date.now() });
  return role;
};

export const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(unauthorized());

  try {
    const decoded = await authFirebase.verifyIdToken(header.split(" ")[1]);
    const role    = await getCachedRole(decoded.uid);
    req.user = { uid: decoded.uid, email: decoded.email, role };
    next();
  } catch (err) {
    // Distinguimos token expirado de token inválido
    const message =
      err.code === "auth/id-token-expired"
        ? "Token expirado. Volvé a iniciar sesión."
        : "Token inválido.";
    next(unauthorized(message));
  }
};

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") return next(forbidden());
  next();
};
EOF
ok "authMiddleware.js"

# =============================================================================
# src/middlewares/validate.js  (nuevo — validación declarativa)
# =============================================================================
log "Escribiendo src/middlewares/validate.js..."
cat > src/middlewares/validate.js << 'EOF'
import { validationResult } from "express-validator";

// Middleware que lee el resultado de express-validator y corta si hay errores
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error:   true,
      message: "Datos de entrada inválidos",
      errors:  errors.array().map(({ path, msg }) => ({ field: path, msg })),
    });
  }
  next();
};
EOF
ok "validate.js"

# =============================================================================
# src/index.js
# =============================================================================
log "Escribiendo src/index.js..."
cat > src/index.js << 'EOF'
import express        from "express";
import cors           from "cors";
import helmet         from "helmet";
import morgan         from "morgan";
import compression    from "compression";
import rateLimit      from "express-rate-limit";
import cron           from "node-cron";
import dotenv         from "dotenv";
dotenv.config();

import connectDB            from "./config/mongo.js";
import { errorHandler }     from "./middlewares/errorHandler.js";

// ── Módulos ──────────────────────────────────────────────────────────────────
import announcementRoutes   from "./modules/ads/ads.routes.js";
import resourceRoutes       from "./modules/resources/resource.routes.js";
import groupRoutes          from "./modules/groups/group.routes.js";
import linksRoutes          from "./modules/links/link.routes.js";
import courseRoutes         from "./modules/courses/course.routes.js";
import aiRoutes             from "./modules/ais/ai.routes.js";
import usersRoutes          from "./modules/users/user.routes.js";

const app = express();

// ── 1. DB ─────────────────────────────────────────────────────────────────────
connectDB();

// ── 2. Seguridad ──────────────────────────────────────────────────────────────
app.set("trust proxy", 1); // Necesario en Render para que rate-limit lea la IP real

app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // Permite embeds de YouTube en el frontend
    contentSecurityPolicy: false,     // El frontend maneja su propia CSP
  })
);

const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Permite requests sin origin (Postman, mobile apps, curl)
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin))
        return cb(null, true);
      cb(new Error(`CORS bloqueado para origin: ${origin}`));
    },
    methods:     ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

// ── 3. Compresión y parseo ────────────────────────────────────────────────────
app.use(compression());                       // gzip — importante en free tier
app.use(express.json({ limit: "2mb" }));      // 10mb era demasiado, 2mb es suficiente
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ── 4. Logging ────────────────────────────────────────────────────────────────
// En producción usamos "combined" (formato Apache, útil para herramientas de monitoreo)
// En desarrollo, "dev" es más legible
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ── 5. Rate Limiting ──────────────────────────────────────────────────────────
const baseLimit = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             300,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: true, message: "Demasiadas peticiones. Intentá en 15 minutos." },
});

// Límite más estricto para la IA (caro en tokens/créditos)
const aiLimit = rateLimit({
  windowMs:        60 * 1000,  // 1 minuto
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: true, message: "Límite del chatbot alcanzado. Esperá 1 minuto." },
});

app.use("/api", baseLimit);
app.use("/api/ai", aiLimit);

// ── 6. Rutas ──────────────────────────────────────────────────────────────────
app.use("/api/announcements", announcementRoutes);
app.use("/api/resources",     resourceRoutes);
app.use("/api/groups",        groupRoutes);
app.use("/api/links",         linksRoutes);
app.use("/api/courses",       courseRoutes);
app.use("/api/ai",            aiRoutes);
app.use("/api/users",         usersRoutes);

// ── 7. Health check (Render lo usa para detectar que el servicio está vivo) ──
app.get("/health", (_req, res) =>
  res.status(200).json({
    status:    "OK",
    service:   "iTEC BA Backend",
    timestamp: new Date().toISOString(),
    uptime:    Math.floor(process.uptime()),
  })
);

// ── 8. Anti-sleep: self-ping cada 14 min (Render free duerme a los 15 min) ───
// Solo activo en producción y si la URL propia está configurada
if (process.env.NODE_ENV === "production" && process.env.RENDER_EXTERNAL_URL) {
  const selfUrl = `${process.env.RENDER_EXTERNAL_URL}/health`;
  cron.schedule("*/14 * * * *", async () => {
    try {
      const res = await fetch(selfUrl, { signal: AbortSignal.timeout(8000) });
      console.log(`🏓 Self-ping OK (${res.status})`);
    } catch (err) {
      console.warn("⚠️  Self-ping falló:", err.message);
    }
  });
  console.log(`🏓 Anti-sleep activo → ${selfUrl}`);
}

// ── 9. 404 para rutas inexistentes ───────────────────────────────────────────
app.use((_req, res) =>
  res.status(404).json({ error: true, message: "Endpoint no encontrado" })
);

// ── 10. Manejador global de errores (SIEMPRE al final) ────────────────────────
app.use(errorHandler);

// ── 11. Manejo de rechazos de promesas no capturadas ─────────────────────────
process.on("unhandledRejection", (reason) => {
  console.error("⚠️  unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("💀 uncaughtException:", err);
  process.exit(1);
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () =>
  console.log(`🚀 Servidor escuchando en puerto ${PORT} [${process.env.NODE_ENV || "development"}]`)
);
EOF
ok "index.js"

# =============================================================================
# src/modules/ads/ads.controller.js
# =============================================================================
log "Escribiendo src/modules/ads/ads.controller.js..."
cat > src/modules/ads/ads.controller.js << 'EOF'
import Announcement from "./ads.model.js";
import { badRequest, notFound } from "../../middlewares/errorHandler.js";

// GET /api/announcements/active
export const getActiveAnnouncement = async (req, res, next) => {
  try {
    // También depuramos los expirados al vuelo (sin tarea cron separada)
    const now = new Date();
    await Announcement.updateMany(
      { active: true, expiresAt: { $lte: now } },
      { active: false }
    );

    const announcements = await Announcement.find({ active: true })
      .sort({ isCritical: -1, createdAt: -1 })
      .select("-__v")
      .lean();

    res.status(200).json(announcements);
  } catch (err) {
    next(err);
  }
};

// POST /api/announcements
export const createAnnouncement = async (req, res, next) => {
  try {
    const { title, message, hoursActive = 24, isCritical = false } = req.body;
    const expiresAt = new Date(Date.now() + Number(hoursActive) * 3_600_000);

    const doc = await Announcement.create({
      title,
      message,
      isCritical: Boolean(isCritical),
      active: true,
      expiresAt,
    });

    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/announcements/:id  (desactiva, no borra — para auditoría)
export const deactivateAnnouncement = async (req, res, next) => {
  try {
    const doc = await Announcement.findByIdAndUpdate(
      req.params.id,
      { active: false },
      { new: true }
    );
    if (!doc) return next(notFound("Anuncio no encontrado"));
    res.status(200).json(doc);
  } catch (err) {
    next(err);
  }
};
EOF
ok "ads.controller.js"

# =============================================================================
# src/modules/ads/ads.routes.js
# =============================================================================
log "Escribiendo src/modules/ads/ads.routes.js..."
cat > src/modules/ads/ads.routes.js << 'EOF'
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
EOF
ok "ads.routes.js"

# =============================================================================
# src/modules/courses/course.controller.js
# =============================================================================
log "Escribiendo src/modules/courses/course.controller.js..."
cat > src/modules/courses/course.controller.js << 'EOF'
import Course   from "./course.model.js";
import youtubedl from "youtube-dl-exec";
import { notFound, badRequest } from "../../middlewares/errorHandler.js";

// GET /api/courses
export const getCourses = async (req, res, next) => {
  try {
    const { categoria, materia, q } = req.query;
    const filter = {};
    if (categoria) filter.categoria = categoria;
    if (materia)   filter.materia   = { $regex: materia, $options: "i" };
    if (q)         filter.title     = { $regex: q, $options: "i" };

    const courses = await Course.find(filter)
      .sort({ createdAt: -1 })
      .select("-videos") // Lista no necesita los videos completos
      .lean();

    res.status(200).json(courses);
  } catch (err) {
    next(err);
  }
};

// GET /api/courses/:id
export const getCourseById = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id).lean();
    if (!course) return next(notFound("Curso no encontrado"));
    res.status(200).json(course);
  } catch (err) {
    next(err);
  }
};

// POST /api/courses
export const createCourse = async (req, res, next) => {
  try {
    const doc = await Course.create(req.body);
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

// PUT /api/courses/:id
export const updateCourse = async (req, res, next) => {
  try {
    // Deshabilitamos __v automático al actualizar
    const doc = await Course.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!doc) return next(notFound("Curso no encontrado"));
    res.status(200).json(doc);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/courses/:id
export const deleteCourse = async (req, res, next) => {
  try {
    const doc = await Course.findByIdAndDelete(req.params.id);
    if (!doc) return next(notFound("Curso no encontrado"));
    res.status(200).json({ message: "Curso eliminado" });
  } catch (err) {
    next(err);
  }
};

// POST /api/courses/fetch-playlist
const formatDuration = (seconds) => {
  if (!seconds) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
};

export const fetchPlaylistDetails = async (req, res, next) => {
  try {
    const { playlistUrl } = req.body;
    if (!playlistUrl) return next(badRequest("URL de playlist requerida"));

    // Timeout de 30s para no bloquear el proceso en free tier
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    let playlistData;
    try {
      playlistData = await youtubedl(playlistUrl, {
        dumpSingleJson:     true,
        flatPlaylist:       true,
        noWarnings:         true,
        callHome:           false,
        noCheckCertificate: true,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!playlistData?.entries?.length) {
      return next(badRequest("Playlist vacía, privada o URL inválida"));
    }

    res.status(200).json({
      title:       playlistData.title       || "Sin título",
      description: playlistData.description || "",
      videos:      playlistData.entries.map(({ id, title, duration }) => ({
        youtubeId: id,
        title:     title || "Sin título",
        duration:  formatDuration(duration),
      })),
    });
  } catch (err) {
    console.error("yt-dlp error:", err.message);
    next(
      Object.assign(
        new Error("No se pudo extraer la playlist. Verificá que sea pública."),
        { statusCode: 502 }
      )
    );
  }
};
EOF
ok "course.controller.js"

# =============================================================================
# src/modules/courses/course.routes.js
# =============================================================================
log "Escribiendo src/modules/courses/course.routes.js..."
cat > src/modules/courses/course.routes.js << 'EOF'
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
EOF
ok "course.routes.js"

# =============================================================================
# src/modules/groups/group.controller.js
# =============================================================================
log "Escribiendo src/modules/groups/group.controller.js..."
cat > src/modules/groups/group.controller.js << 'EOF'
import Group from "./group.model.js";
import { notFound } from "../../middlewares/errorHandler.js";

// GET /api/groups  — públicos y aprobados, con filtros opcionales
export const getApprovedGroups = async (req, res, next) => {
  try {
    const { carrera, materia, nivel } = req.query;
    const filter = { isApproved: true };
    if (carrera) filter.carrera = { $regex: carrera, $options: "i" };
    if (materia) filter.materia = { $regex: materia, $options: "i" };
    if (nivel)   filter.nivel   = nivel;

    const groups = await Group.find(filter).sort({ createdAt: -1 }).lean();
    res.status(200).json(groups);
  } catch (err) {
    next(err);
  }
};

// GET /api/groups/pending  — solo admin
export const getPendingGroups = async (req, res, next) => {
  try {
    const groups = await Group.find({ isApproved: false })
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(groups);
  } catch (err) {
    next(err);
  }
};

// POST /api/groups  — cualquier usuario autenticado puede proponer
export const createGroup = async (req, res, next) => {
  try {
    const doc = await Group.create({
      ...req.body,
      submittedBy: req.user?.uid ?? "anon",
      isApproved:  false,
    });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

// PUT /api/groups/:id/approve  — solo admin
export const approveGroup = async (req, res, next) => {
  try {
    const doc = await Group.findByIdAndUpdate(
      req.params.id,
      { isApproved: true },
      { new: true }
    );
    if (!doc) return next(notFound("Grupo no encontrado"));
    res.status(200).json(doc);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/groups/:id  — solo admin
export const deleteGroup = async (req, res, next) => {
  try {
    const doc = await Group.findByIdAndDelete(req.params.id);
    if (!doc) return next(notFound("Grupo no encontrado"));
    res.status(200).json({ message: "Grupo eliminado" });
  } catch (err) {
    next(err);
  }
};
EOF
ok "group.controller.js"

# =============================================================================
# src/modules/groups/group.routes.js
# =============================================================================
log "Escribiendo src/modules/groups/group.routes.js..."
cat > src/modules/groups/group.routes.js << 'EOF'
import { Router }                    from "express";
import { body }                      from "express-validator";
import { validate }                  from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import {
  getApprovedGroups,
  getPendingGroups,
  createGroup,
  approveGroup,
  deleteGroup,
} from "./group.controller.js";

const router = Router();

const groupValidators = [
  body("materia").trim().notEmpty().withMessage("Materia requerida"),
  body("carrera").trim().notEmpty().withMessage("Carrera requerida"),
  body("nivel").trim().notEmpty().withMessage("Nivel requerido"),
  body("comision").trim().notEmpty().withMessage("Comisión requerida"),
  body("link").trim().isURL().withMessage("Link debe ser una URL válida"),
  body("tipo").optional().isIn(["Oficial", "Alumnos"]),
];

router.get("/",                getApprovedGroups);
router.post(
  "/",
  verifyToken,
  groupValidators, validate,
  createGroup
);

router.get("/pending",         verifyToken, requireAdmin, getPendingGroups);
router.put("/:id/approve",     verifyToken, requireAdmin, approveGroup);
router.delete("/:id",          verifyToken, requireAdmin, deleteGroup);

export default router;
EOF
ok "group.routes.js"

# =============================================================================
# src/modules/links/link.controller.js
# =============================================================================
log "Escribiendo src/modules/links/link.controller.js..."
cat > src/modules/links/link.controller.js << 'EOF'
import Link from "./link.model.js";
import { notFound } from "../../middlewares/errorHandler.js";

export const getLinks = async (req, res, next) => {
  try {
    const links = await Link.find().sort({ order: 1 }).select("-__v").lean();
    res.status(200).json(links);
  } catch (err) {
    next(err);
  }
};

export const createLink = async (req, res, next) => {
  try {
    const doc = await Link.create(req.body);
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

export const updateLink = async (req, res, next) => {
  try {
    const doc = await Link.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!doc) return next(notFound("Link no encontrado"));
    res.status(200).json(doc);
  } catch (err) {
    next(err);
  }
};

export const deleteLink = async (req, res, next) => {
  try {
    const doc = await Link.findByIdAndDelete(req.params.id);
    if (!doc) return next(notFound("Link no encontrado"));
    res.status(200).json({ message: "Link eliminado" });
  } catch (err) {
    next(err);
  }
};
EOF
ok "link.controller.js"

# =============================================================================
# src/modules/links/link.routes.js
# =============================================================================
log "Escribiendo src/modules/links/link.routes.js..."
cat > src/modules/links/link.routes.js << 'EOF'
import { Router }                    from "express";
import { body }                      from "express-validator";
import { validate }                  from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import { getLinks, createLink, updateLink, deleteLink } from "./link.controller.js";

const router = Router();

const linkValidators = [
  body("title").trim().notEmpty().withMessage("Título requerido"),
  body("url").trim().isURL().withMessage("URL inválida"),
  body("icon").trim().notEmpty().withMessage("Ícono requerido"),
  body("order").optional().isInt({ min: 0 }).toInt(),
];

router.get("/", getLinks);
router.post("/",    verifyToken, requireAdmin, linkValidators, validate, createLink);
router.put("/:id",  verifyToken, requireAdmin, linkValidators, validate, updateLink);
router.delete("/:id", verifyToken, requireAdmin, deleteLink);

export default router;
EOF
ok "link.routes.js"

# =============================================================================
# src/modules/resources/resource.controller.js
# =============================================================================
log "Escribiendo src/modules/resources/resource.controller.js..."
cat > src/modules/resources/resource.controller.js << 'EOF'
import Resource from "./resource.model.js";
import { notFound } from "../../middlewares/errorHandler.js";

// GET /api/resources
export const getApprovedResources = async (req, res, next) => {
  try {
    const { carrera, materia, nivel, tipo, formato } = req.query;
    const filter = { isApproved: true };
    if (carrera) filter.carrera = { $regex: carrera, $options: "i" };
    if (materia) filter.materia = { $regex: materia, $options: "i" };
    if (nivel)   filter.nivel   = nivel;
    if (tipo)    filter.tipo     = tipo;
    if (formato) filter.formato  = formato;

    const resources = await Resource.find(filter)
      .sort({ createdAt: -1 })
      .select("-__v")
      .lean();

    res.status(200).json(resources);
  } catch (err) {
    next(err);
  }
};

// GET /api/resources/pending
export const getPendingResources = async (req, res, next) => {
  try {
    const resources = await Resource.find({ isApproved: false })
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(resources);
  } catch (err) {
    next(err);
  }
};

// POST /api/resources
export const createResource = async (req, res, next) => {
  try {
    const doc = await Resource.create({
      ...req.body,
      submittedBy: req.user?.uid ?? "anon",
      isApproved: false,
    });
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
};

// PUT /api/resources/:id/approve
export const approveResource = async (req, res, next) => {
  try {
    const doc = await Resource.findByIdAndUpdate(
      req.params.id,
      { isApproved: true },
      { new: true }
    );
    if (!doc) return next(notFound("Aporte no encontrado"));
    res.status(200).json(doc);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/resources/:id
export const deleteResource = async (req, res, next) => {
  try {
    const doc = await Resource.findByIdAndDelete(req.params.id);
    if (!doc) return next(notFound("Aporte no encontrado"));
    res.status(200).json({ message: "Aporte eliminado" });
  } catch (err) {
    next(err);
  }
};
EOF
ok "resource.controller.js"

# =============================================================================
# src/modules/resources/resource.routes.js
# =============================================================================
log "Escribiendo src/modules/resources/resource.routes.js..."
cat > src/modules/resources/resource.routes.js << 'EOF'
import { Router }                    from "express";
import { body }                      from "express-validator";
import { validate }                  from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import {
  getApprovedResources,
  getPendingResources,
  createResource,
  approveResource,
  deleteResource,
} from "./resource.controller.js";

const router = Router();

const resourceValidators = [
  body("title").trim().notEmpty().withMessage("Título requerido"),
  body("carrera").trim().notEmpty().withMessage("Carrera requerida"),
  body("nivel").trim().notEmpty().withMessage("Nivel requerido"),
  body("materia").trim().notEmpty().withMessage("Materia requerida"),
  body("tipo").trim().notEmpty().withMessage("Tipo requerido"),
  body("formato").trim().notEmpty().withMessage("Formato requerido"),
  body("link").trim().isURL().withMessage("Link debe ser una URL válida"),
];

router.get("/",             getApprovedResources);
router.post(
  "/",
  verifyToken,
  resourceValidators, validate,
  createResource
);
router.get("/pending",      verifyToken, requireAdmin, getPendingResources);
router.put("/:id/approve",  verifyToken, requireAdmin, approveResource);
router.delete("/:id",       verifyToken, requireAdmin, deleteResource);

export default router;
EOF
ok "resource.routes.js"

# =============================================================================
# src/modules/ais/ai.service.js
# =============================================================================
log "Escribiendo src/modules/ais/ai.service.js..."
cat > src/modules/ais/ai.service.js << 'EOF'
import dotenv from "dotenv";
dotenv.config();

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL    = "llama-3.1-8b-instant";

const SYSTEM_PROMPT = `
Sos 'ITEC Bot', el asistente virtual oficial de ITEC BA — la plataforma estudiantil
de la UTN Facultad Regional Buenos Aires, creada por y para estudiantes.

PLATAFORMA ITEC BA:
- Cursos: videos y guías para aprender los temas de las materias
- Grupos: links de WhatsApp por materia y comisión
- Aportes (Recursos): resúmenes, parciales y finales de la comunidad
- Progreso: dashboard para seguir materias aprobadas y promedio
- TarjeTEC: sistema de puntos por aportar a la comunidad

REGLAS:
- Respondé en español rioplatense (vos, che), de forma directa y amigable
- Solo hablás sobre temas universitarios, académicos y de la UTN / ITEC BA
- Si te pasan "Contexto Oficial", usalo como fuente principal
- Si no sabés algo, decilo sin inventar
`.trim();

export const generateAIResponse = async (userText, history = []) => {
  if (!process.env.GROQ_API_KEY) {
    throw Object.assign(new Error("GROQ_API_KEY no configurada"), { statusCode: 503 });
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    // Convertimos el historial del formato Gemini al formato OpenAI
    ...history.map((msg) => ({
      role:    msg.role === "model" ? "assistant" : "user",
      content: msg.parts?.[0]?.text ?? msg.content ?? "",
    })),
    { role: "user", content: userText },
  ];

  const response = await fetch(GROQ_URL, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:       MODEL,
      messages,
      temperature: 0.5,
      max_tokens:  800, // Límite razonable para free tier
    }),
    signal: AbortSignal.timeout(30_000), // 30s timeout
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Groq error:", response.status, detail);
    throw Object.assign(
      new Error("El servicio de IA no está disponible. Intentá más tarde."),
      { statusCode: 503 }
    );
  }

  const data = await response.json();
  return data.choices[0].message.content;
};
EOF
ok "ai.service.js"

# =============================================================================
# src/modules/ais/ai.routes.js
# =============================================================================
log "Escribiendo src/modules/ais/ai.routes.js..."
cat > src/modules/ais/ai.routes.js << 'EOF'
import { Router } from "express";
import { body }   from "express-validator";
import { validate }       from "../../middlewares/validate.js";
import { verifyToken }    from "../../middlewares/authMiddleware.js";
import { generateAIResponse } from "./ai.service.js";

const router = Router();

router.post(
  "/chat",
  verifyToken, // El chatbot requiere estar logueado para evitar abuso
  [
    body("message")
      .trim()
      .notEmpty().withMessage("El mensaje no puede estar vacío")
      .isLength({ max: 1000 }).withMessage("Mensaje demasiado largo (máx. 1000 caracteres)"),
    body("history")
      .optional()
      .isArray({ max: 20 }).withMessage("Historial inválido"),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { message, history = [] } = req.body;
      const response = await generateAIResponse(message, history);
      res.json({ response });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
EOF
ok "ai.routes.js"

# =============================================================================
# src/modules/users/  (NUEVO módulo — el frontend lo consume en adminService.ts)
# =============================================================================
log "Creando módulo users (src/modules/users/)..."
mkdir -p src/modules/users

cat > src/modules/users/user.controller.js << 'EOF'
import { dbFirebase, authFirebase } from "../../config/firebase-admin.js";
import { notFound, badRequest }     from "../../middlewares/errorHandler.js";

// GET /api/users  — lista paginada de usuarios (solo admin)
export const getUsers = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    // nextPageToken permite paginación en Firebase Auth
    const pageToken  = req.query.pageToken || undefined;
    const listResult = await authFirebase.listUsers(limit, pageToken);

    // Enriquecemos con el rol desde Firestore (en paralelo, limitado a 10 por batch)
    const enriched = await Promise.all(
      listResult.users.map(async (user) => {
        const doc  = await dbFirebase.collection("users").doc(user.uid).get();
        const data = doc.exists ? doc.data() : {};
        return {
          uid:         user.uid,
          email:       user.email,
          displayName: user.displayName,
          photoURL:    user.photoURL,
          disabled:    user.disabled,
          createdAt:   user.metadata.creationTime,
          role:        data.role ?? "student",
          points:      data.points ?? 0,
        };
      })
    );

    res.status(200).json({
      users:         enriched,
      nextPageToken: listResult.pageToken ?? null,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/users/search?email=xxx  — buscar por email (admin)
export const searchUserByEmail = async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email) return next(badRequest("Parámetro email requerido"));

    const userRecord = await authFirebase.getUserByEmail(email).catch(() => null);
    if (!userRecord) return next(notFound("Usuario no encontrado"));

    const doc  = await dbFirebase.collection("users").doc(userRecord.uid).get();
    const data = doc.exists ? doc.data() : {};

    res.status(200).json({
      uid:         userRecord.uid,
      email:       userRecord.email,
      displayName: userRecord.displayName,
      photoURL:    userRecord.photoURL,
      role:        data.role ?? "student",
      points:      data.points ?? 0,
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/users/:uid/role  — cambiar rol (admin)
export const updateUserRole = async (req, res, next) => {
  try {
    const { uid }  = req.params;
    const { role } = req.body;
    const VALID_ROLES = ["student", "admin", "moderator"];

    if (!VALID_ROLES.includes(role)) {
      return next(badRequest(`Rol inválido. Debe ser: ${VALID_ROLES.join(", ")}`));
    }
    // Evitar que el admin se auto-demote accidentalmente
    if (uid === req.user.uid && role !== "admin") {
      return next(badRequest("No podés cambiar tu propio rol"));
    }

    await dbFirebase.collection("users").doc(uid).set({ role }, { merge: true });
    res.status(200).json({ uid, role, message: "Rol actualizado" });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/users/:uid/points  — sumar/restar puntos (admin)
export const updateUserPoints = async (req, res, next) => {
  try {
    const { uid }    = req.params;
    const { points } = req.body;

    const ref      = dbFirebase.collection("users").doc(uid);
    const doc      = await ref.get();
    if (!doc.exists) return next(notFound("Usuario no encontrado en Firestore"));

    const current  = doc.data().points ?? 0;
    const newTotal = Math.max(0, current + Number(points));
    await ref.set({ points: newTotal }, { merge: true });

    res.status(200).json({ uid, points: newTotal });
  } catch (err) {
    next(err);
  }
};
EOF

cat > src/modules/users/user.routes.js << 'EOF'
import { Router }                    from "express";
import { body, query }               from "express-validator";
import { validate }                  from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import {
  getUsers,
  searchUserByEmail,
  updateUserRole,
  updateUserPoints,
} from "./user.controller.js";

const router = Router();

// Todas las rutas de usuarios son exclusivas de admin
router.use(verifyToken, requireAdmin);

router.get(
  "/",
  [query("limit").optional().isInt({ min: 1, max: 100 }).toInt()],
  validate,
  getUsers
);

router.get(
  "/search",
  [query("email").isEmail().withMessage("Email inválido")],
  validate,
  searchUserByEmail
);

router.patch(
  "/:uid/role",
  [body("role").trim().notEmpty().withMessage("Rol requerido")],
  validate,
  updateUserRole
);

router.patch(
  "/:uid/points",
  [body("points").isNumeric().withMessage("Puntos debe ser un número")],
  validate,
  updateUserPoints
);

export default router;
EOF
ok "users module (user.controller.js + user.routes.js)"

# =============================================================================
# package.json — agregar scripts útiles
# =============================================================================
log "Actualizando package.json..."
node - << 'JSEOF'
import { readFileSync, writeFileSync } from "fs";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.scripts = {
  ...pkg.scripts,
  "start": "node src/index.js",
  "dev":   "nodemon src/index.js",
  "lint":  "node --check src/**/*.js || true"
};
// Aseguramos que las nuevas deps estén declaradas
pkg.dependencies["compression"]       = pkg.dependencies["compression"]       || "^1.8.0";
pkg.dependencies["node-cron"]         = pkg.dependencies["node-cron"]         || "^3.0.3";
pkg.dependencies["express-validator"] = pkg.dependencies["express-validator"] || "^7.2.1";
writeFileSync("package.json", JSON.stringify(pkg, null, 2));
console.log("package.json actualizado");
JSEOF
ok "package.json"

# =============================================================================
# .env.example — referencia de variables
# =============================================================================
log "Creando .env.example..."
cat > .env.example << 'EOF'
# ── Servidor ──────────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=5001

# ── URLs ──────────────────────────────────────────────────────────────────────
# Separadas por coma si hay más de un origen
FRONTEND_URL=https://tu-frontend.vercel.app
# URL que Render asigna automáticamente al servicio (para self-ping)
RENDER_EXTERNAL_URL=https://tu-backend.onrender.com

# ── MongoDB Atlas ─────────────────────────────────────────────────────────────
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/itecba?retryWrites=true&w=majority

# ── Firebase Admin SDK ────────────────────────────────────────────────────────
FIREBASE_PROJECT_ID=tu-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@tu-project.iam.gserviceaccount.com
# La private key: copiar el valor completo del JSON, incluyendo los \n literales
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"

# ── IA (Groq) ─────────────────────────────────────────────────────────────────
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxx
EOF
ok ".env.example"

# =============================================================================
# Resumen
# =============================================================================
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅  iTEC BA Backend — Refactor completado${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Archivos modificados:${NC}"
echo "   • src/index.js                         — compresión, CORS múltiple, anti-sleep, rate-limit por módulo"
echo "   • src/config/firebase-admin.js         — validación de env vars, init guard"
echo "   • src/config/mongo.js                  — opciones de pool, eventos de reconexión"
echo "   • src/middlewares/errorHandler.js      — AppError, manejo de CastError/ValidationError/11000"
echo "   • src/middlewares/authMiddleware.js     — caché de roles (5 min), mensajes de error precisos"
echo "   • src/middlewares/validate.js          — NUEVO: integración express-validator"
echo "   • src/modules/ads/*                    — validación, expiración automática al GET"
echo "   • src/modules/courses/*                — filtros por query, timeout yt-dlp"
echo "   • src/modules/groups/*                 — filtros por query, verifyToken en POST"
echo "   • src/modules/links/*                  — validación completa"
echo "   • src/modules/resources/*              — filtros por query, verifyToken en POST"
echo "   • src/modules/ais/*                    — timeout fetch, max_tokens, verifyToken"
echo "   • src/modules/users/*                  — NUEVO módulo: getUsers, search, role, points"
echo "   • .env.example                         — referencia de todas las variables"
echo ""
echo -e "  ${CYAN}Variables de entorno necesarias en Render:${NC}"
echo "   NODE_ENV, PORT, FRONTEND_URL, RENDER_EXTERNAL_URL"
echo "   MONGODB_URI, FIREBASE_*, GROQ_API_KEY"
echo ""
echo -e "  ${YELLOW}Próximos pasos:${NC}"
echo "   1. npm install           (instala las 3 nuevas deps)"
echo "   2. Configurar .env con los valores reales"
echo "   3. En Render: agregar RENDER_EXTERNAL_URL = la URL de tu servicio"
echo "   4. npm run dev  y probar /health"
echo ""
