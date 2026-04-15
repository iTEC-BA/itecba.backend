import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config();

// IMPORTACIONES LOCALES (Deben llevar .js al final)
import connectDB from "./config/mongo.js";
import { errorHandler } from "./middlewares/errorHandler.js";

// Importación de Rutas (Asegúrate de que estos archivos también usen export default)
import announcementRoutes from "./modules/ads/ads.routes.js";
import resourceRoutes from "./modules/resources/resource.routes.js";
import groupRoutes from "./modules/groups/group.routes.js";
import linksRoutes from "./modules/links/link.routes.js";
import courseRoutes from "./modules/courses/course.routes.js";
import aiRoutes from "./modules/ais/ai.routes.js";

const app = express();

// 1. Conexión a DB
connectDB();

// 2. Seguridad y Middlewares Globales
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// 3. Limitador de peticiones (Protección DDoS)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000,
  message: {
    error: true,
    message: "Demasiadas peticiones. Intenta más tarde.",
  },
});
app.use("/api", apiLimiter);

// 4. Rutas
app.use("/api/announcements", announcementRoutes);
app.use("/api/resources", resourceRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/links", linksRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/ai", aiRoutes);

app.get("/health", (req, res) => {
  res
    .status(200)
    .json({ status: "OK", message: "ITEC Backend funcionando al 100%" });
});

// 5. MANEJADOR GLOBAL DE ERRORES (Siempre va al final)
app.use(errorHandler);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo de forma segura en el puerto ${PORT}`);
});
