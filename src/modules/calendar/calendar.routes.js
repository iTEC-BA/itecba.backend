import { Router } from "express";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import { getEvents, createEvent, deleteEvent, updateEvent } from "./calendar.controller.js";

const router = Router();

router.get("/", getEvents);
router.post("/", verifyToken, requireAdmin, createEvent);
router.delete("/:id", verifyToken, requireAdmin, deleteEvent);
router.patch("/:id",  verifyToken, requireAdmin, updateEvent);

export default router;
