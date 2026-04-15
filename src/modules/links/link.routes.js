import { Router } from "express";
import {
  getLinks,
  createLink,
  updateLink,
  deleteLink,
} from "./link.controller.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js"; // 🔴 Importamos la seguridad

const router = Router();

// GET es público (Cualquier alumno puede ver los links)
router.get("/", getLinks);

// POST, PUT y DELETE son EXCLUSIVOS para Admins
router.post("/", verifyToken, requireAdmin, createLink);
router.put("/:id", verifyToken, requireAdmin, updateLink);
router.delete("/:id", verifyToken, requireAdmin, deleteLink);

export default router;
