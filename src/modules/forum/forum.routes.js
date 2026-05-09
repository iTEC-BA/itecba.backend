// src/modules/forum/forum.routes.js
import { Router } from "express";
import { body }   from "express-validator";
import { validate }   from "../../middlewares/validate.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import {
  getPosts,
  getThread,
  createPost,
  createReply,
  votePost,
  deletePost,
  savePushSubscription,
  getVapidPublicKey,
} from "./forum.controller.js";

const router = Router();

// ── Rutas públicas (opcionalmente autenticadas para mostrar voto propio) ──────
// verifyToken opcional: si el header está presente lo procesa, si no, pasa
const optionalAuth = async (req, res, next) => {
  if (req.headers.authorization?.startsWith("Bearer ")) {
    return verifyToken(req, res, next);
  }
  next();
};

router.get("/posts",          optionalAuth, getPosts);
router.get("/posts/:id",      optionalAuth, getThread);
router.get("/push/vapid-key", getVapidPublicKey);

// ── Rutas protegidas ──────────────────────────────────────────────────────────
router.post(
  "/posts",
  verifyToken,
  [body("body").trim().notEmpty().withMessage("El cuerpo del post es requerido")],
  validate,
  createPost
);

router.post(
  "/posts/:id/replies",
  verifyToken,
  [body("body").trim().notEmpty().withMessage("La respuesta no puede estar vacía")],
  validate,
  createReply
);

router.post(
  "/posts/:id/vote",
  verifyToken,
  [body("value").isIn([1, -1]).withMessage("value debe ser 1 o -1")],
  validate,
  votePost
);

router.delete("/posts/:id", verifyToken, deletePost);

router.post(
  "/push/subscribe",
  verifyToken,
  [body("subscription").notEmpty().withMessage("Suscripción requerida")],
  validate,
  savePushSubscription
);

export default router;
