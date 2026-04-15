import { Router } from "express";
import {
  getApprovedGroups,
  getPendingGroups,
  createGroup,
  approveGroup,
  deleteGroup,
} from "./group.controller.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";

const router = Router();

// 🟢 RUTAS PÚBLICAS
router.get("/", getApprovedGroups);
router.post("/", createGroup); // Subir un grupo queda pendiente de aprobación

// 🔴 RUTAS PROTEGIDAS
router.get("/pending", verifyToken, requireAdmin, getPendingGroups);
router.put("/:id/approve", verifyToken, requireAdmin, approveGroup);
router.delete("/:id", verifyToken, requireAdmin, deleteGroup);

export default router;
