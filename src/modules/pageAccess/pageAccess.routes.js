// src/modules/pageAccess/pageAccess.routes.js
import { Router } from "express";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import {
  getAllPageAccess,
  setPageAccess,
  removePageAccess,
} from "./pageAccess.controller.js";

const router = Router();

// Lectura: solo admin (el frontend público lee directo de Firestore vía SDK,
// no necesita este endpoint; esto es un fallback administrativo/externo).
router.get("/", verifyToken, requireAdmin, getAllPageAccess);

// Escritura: solo admin.
// "{*path}" es la sintaxis de wildcard de Express 5 / path-to-regexp v8
// (reemplaza a "/:path*" de Express 4). Captura rutas con barras, ej:
// PUT /api/page-access/admin/dashboard  →  req.params.path === ["admin","dashboard"]
router.put("/{*path}", verifyToken, requireAdmin, setPageAccess);
router.delete("/{*path}", verifyToken, requireAdmin, removePageAccess);

export default router;
