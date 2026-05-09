import { Router } from "express";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { getPosts, getThread, createPost, createReply, votePost, deletePost, savePushSubscription, getVapidPublicKey } from "./forum.controller.js";

const router = Router();

router.get("/push/vapid-key", getVapidPublicKey);
router.post("/push/subscribe", verifyToken, savePushSubscription);

router.get("/posts", getPosts);
router.get("/posts/:id", getThread);
router.post("/posts", verifyToken, createPost);
router.post("/posts/:id/replies", verifyToken, createReply);
router.post("/posts/:id/vote", verifyToken, votePost);
router.delete("/posts/:id", verifyToken, deletePost);

export default router;
