import { Router } from "express";
import {
  getApprovedResources,
  getPendingResources,
  createResource,
  approveResource,
  deleteResource,
} from "./resource.controller.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js"; // 🔴 IMPORTAMOS SEGURIDAD

const router = Router();

// 🟢 RUTAS PÚBLICAS
router.get("/", getApprovedResources);
router.post("/", createResource);

// 🔴 RUTAS PROTEGIDAS (Solo Admins)
router.get("/pending", verifyToken, requireAdmin, getPendingResources);
router.put("/:id/approve", verifyToken, requireAdmin, approveResource);
router.delete("/:id", verifyToken, requireAdmin, deleteResource);

export default router;
