// src/modules/notifications/notification.routes.js
import { Router } from "express";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import {
  getVapidKey,
  subscribePush,
  unsubscribePush,
} from "./notification.controller.js";

const router = Router();

router.get("/vapid-key", getVapidKey);
router.post("/subscribe", verifyToken, subscribePush);
router.delete("/unsubscribe", verifyToken, unsubscribePush);

export default router;
