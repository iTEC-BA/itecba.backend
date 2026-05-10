import { Router } from "express";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import { getEvents, createEvent, deleteEvent } from "./calendar.controller.js";

const router = Router();

router.get("/", getEvents);
router.post("/", verifyToken, requireAdmin, createEvent);
router.delete("/:id", verifyToken, requireAdmin, deleteEvent);

export default router;
