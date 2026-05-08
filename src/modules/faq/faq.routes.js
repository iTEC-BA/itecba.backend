import express from "express";
const router = express.Router();
import ctrl from "./faq.controller.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";

// Públicas
router.get("/", ctrl.getAll);
router.get("/search", ctrl.search);
router.get("/top", ctrl.getTop);
router.patch("/:id/use", ctrl.trackUse);

// Admin
router.post("/", verifyToken, requireAdmin, ctrl.create);
router.patch("/:id", verifyToken, requireAdmin, ctrl.update);
router.delete("/:id", verifyToken, requireAdmin, ctrl.delete);

export default router;
