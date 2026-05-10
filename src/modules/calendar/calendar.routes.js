import { Router } from "express";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { getCalendarEvents, createEvent, deleteEvent } from "./calendar.controller.js";

const router = Router();

router.get("/", getCalendarEvents); // Público para ver
router.post("/", verifyToken, createEvent); // Solo Admin (verificado en controller)
router.delete("/:id", verifyToken, deleteEvent); // Solo Admin

export default router;
