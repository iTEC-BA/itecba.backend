import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";
import cron from "node-cron";
import dotenv from "dotenv";
dotenv.config();

import connectDB from "./config/mongo.js";
import { initForumDB } from "./config/turso.js";
import { checkSupabaseConnection } from "./config/supabase.js"; // <--- NUEVO: Importamos la función de Turso
import { errorHandler } from "./middlewares/errorHandler.js";
import { dbFirebase } from "./config/firebase-admin.js"; // [CALENDAR_CRON]

// ── Módulos ──────────────────────────────────────────────────────────────────
import announcementRoutes from "./modules/ads/ads.routes.js";
import resourceRoutes from "./modules/resources/resource.routes.js";
import groupRoutes from "./modules/groups/group.routes.js";
import linksRoutes from "./modules/links/link.routes.js";
import courseRoutes from "./modules/courses/course.routes.js";
import aiRoutes from "./modules/ais/ai.routes.js";
import usersRoutes from "./modules/users/user.routes.js";
import rewardRoutes from "./modules/rewards/reward.routes.js";
import messageRoutes from "./modules/messages/message.routes.js";
import materiasRoutes from "./modules/materias/materias.routes.js";
import benefitRoutes from "./modules/benefits/benefit.routes.js";
import faqRoutes from "./modules/faq/faq.routes.js";
import forumRoutes from "./modules/forum/forum.routes.js";
import calendarRoutes from "./modules/calendar/calendar.routes.js";
import notificationRoutes from "./modules/notifications/notification.routes.js";
import trueketecRoutes from "./modules/trueketec/trueketec.routes.js";
import aulasRoutes from "./modules/aulas/aula.routes.js";
import { cleanExpiredPosts } from "./modules/trueketec/trueketec.controller.js";
import { initWebPush } from "./modules/notifications/notification.controller.js";
import { migrateCourseStatus } from "./scripts/migrate-courses-status-fn.js";

const app = express();

// ── 0. DB ─────────────────────────────────────────────────────────────────────
connectDB();
initForumDB();
checkSupabaseConnection();

// ── 1. notificaciones ─────────────────────────────────────────────────────────────────────
initWebPush();

// ── 2. Seguridad ──────────────────────────────────────────────────────────────
app.set("trust proxy", 1); // Necesario en Render para que rate-limit lea la IP real

app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // Permite embeds de YouTube en el frontend
    contentSecurityPolicy: false, // El frontend maneja su propia CSP
  }),
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
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

// ── 3. Compresión y parseo ────────────────────────────────────────────────────
app.use(compression()); // gzip — importante en free tier
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// ── 4. Logging ────────────────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ── 5. Rate Limiting ──────────────────────────────────────────────────────────
const baseLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: true,
    message: "Demasiadas peticiones. Intentá en 15 minutos.",
  },
});

// Límite más estricto para la IA (caro en tokens/créditos)
const aiLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: true,
    message: "Límite del chatbot alcanzado. Esperá 1 minuto.",
  },
});

app.use("/api", baseLimit);
app.use("/api/ai", aiLimit);

// ── 6. Rutas ──────────────────────────────────────────────────────────────────
app.use("/api/announcements", announcementRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/links", linksRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/rewards", rewardRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/materias", materiasRoutes);
app.use("/api/benefits", benefitRoutes);
app.use("/api/faqs", faqRoutes); // alias plural (frontend usa /faqs)
app.use("/api/faq", faqRoutes);
app.use("/api/forum", forumRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/trueketec", trueketecRoutes);
app.use("/api/aulas", aulasRoutes);

// ── 7. Health check (Render lo usa para detectar que el servicio está vivo) ──
app.get("/health", (_req, res) =>
  res.status(200).json({
    status: "OK",
    service: "iTEC BA Backend",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  }),
);

// ── 8. Anti-sleep: self-ping cada 14 min (Render free duerme a los 15 min) ───
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
  res.status(404).json({ error: true, message: "Endpoint no encontrado" }),
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
// TruekeTEC — Limpiar solicitudes expiradas cada 12h
setInterval(cleanExpiredPosts, 12 * 60 * 60 * 1000);

app.listen(PORT, () =>
  console.log(
    `🚀 Servidor escuchando en puerto ${PORT} [${process.env.NODE_ENV || "development"}]`,
  ),
);
