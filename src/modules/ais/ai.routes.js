// src/modules/ais/ai.routes.js
import { Router } from "express";
import ctrl       from "./ai.controller.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";

const router = Router();

router.post("/chat",         verifyToken,               ctrl.chat);
router.patch("/deduct-points", verifyToken,             ctrl.deductPoints);
router.get("/context",                                  ctrl.getContext);
router.patch("/context",     verifyToken, requireAdmin, ctrl.updateContext);
router.post("/clear-cache",  verifyToken, requireAdmin, ctrl.clearCache);

export default router;
