import express from "express";
import { messageController } from "./message.controller.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/my-messages", verifyToken, messageController.getMyMessages);
router.patch("/:id/read", verifyToken, messageController.markAsRead);
router.post("/send", verifyToken, requireAdmin, messageController.sendMessage);

export default router;
