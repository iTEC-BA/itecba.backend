import { Router } from "express";
import {
  getActiveAnnouncement,
  createAnnouncement,
  deactivateAnnouncement,
} from "./ads.controller.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";

const router = Router();

// 🟢 RUTAS PÚBLICAS
router.get("/active", getActiveAnnouncement);

// 🔴 RUTAS PROTEGIDAS
router.post("/", verifyToken, requireAdmin, createAnnouncement);
router.put(
  "/:id/deactivate",
  verifyToken,
  requireAdmin,
  deactivateAnnouncement,
);

export default router;
