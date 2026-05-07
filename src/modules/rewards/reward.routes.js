import express from "express";
import { rewardController } from "./reward.controller.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/redeem", verifyToken, rewardController.redeemReward);
router.post(
  "/create",
  verifyToken,
  requireAdmin,
  rewardController.createReward,
);
router.get("/list", verifyToken, rewardController.getRewards);

router.get(
  "/redemptions",
  verifyToken,
  requireAdmin,
  rewardController.getAllRedemptions,
);

// GET /api/rewards/all — todos los rewards (admin, incluye inactivos)
router.get("/all", verifyToken, requireAdmin, rewardController.getAllRewards);

// PUT /api/rewards/:id — actualizar reward (admin)
router.put("/:id", verifyToken, requireAdmin, rewardController.updateReward);

// DELETE /api/rewards/:id — eliminar reward (admin)
router.delete("/:id", verifyToken, requireAdmin, rewardController.deleteReward);

export default router;
