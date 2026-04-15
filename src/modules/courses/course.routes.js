import { Router } from "express";
import {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  fetchPlaylistDetails, // 🔴 IMPORTA LA NUEVA FUNCIÓN
} from "./course.controller.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";

const router = Router();

router.get("/", getCourses);
router.get("/:id", getCourseById);

// 🔴 AGREGA ESTA LÍNEA PARA YOUTUBE
router.post("/fetch-playlist", verifyToken, requireAdmin, fetchPlaylistDetails);

router.post("/", verifyToken, requireAdmin, createCourse);
router.put("/:id", verifyToken, requireAdmin, updateCourse);
router.delete("/:id", verifyToken, requireAdmin, deleteCourse);

export default router;
