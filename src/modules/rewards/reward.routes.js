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
export default router;
