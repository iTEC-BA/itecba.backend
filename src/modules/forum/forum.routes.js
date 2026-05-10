// src/modules/forum/forum.routes.js
import { Router }                    from "express";
import { body, query }               from "express-validator";
import { validate }                  from "../../middlewares/validate.js";
import { verifyToken, requireAdmin } from "../../middlewares/authMiddleware.js";
import {
  getPosts, getThread,
  createPost, createReply,
  votePost, repostPost,
  getTrending, deletePost,
  getBanners, createBanner, updateBanner, deleteBanner,
  savePushSubscription, getVapidPublicKey,
} from "./forum.controller.js";

const router = Router();

// ── Push ──────────────────────────────────────────────────────
router.get("/push/vapid-key",   getVapidPublicKey);
router.post("/push/subscribe",  verifyToken, savePushSubscription);

// ── Feed (opcionalmente autenticado para mostrar votos propios) ─
router.get(
  "/posts",
  [
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("tab").optional().isIn([
      "para-ti", "siguiendo", "utn-ba", "tendencias", "materias",
    ]),
  ],
  validate,
  // verifyToken opcional — lo manejamos inside del controller con req.user ?? null
  (req, _res, next) => {
    // Si hay token, lo verificamos; si no, continuamos sin usuario.
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      return verifyToken(req, _res, next);
    }
    next();
  },
  getPosts,
);

// ── Thread (opcionalmente autenticado) ───────────────────────
router.get(
  "/posts/:id",
  (req, _res, next) => {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) return verifyToken(req, _res, next);
    next();
  },
  getThread,
);

// ── Crear post / respuesta ─────────────────────────────────
router.post(
  "/posts",
  verifyToken,
  [
    body("body")
      .trim().notEmpty().isLength({ min: 3, max: 1000 })
      .withMessage("El contenido debe tener entre 3 y 1000 caracteres"),
    body("parent_id").optional().isInt({ min: 1 }).toInt(),
  ],
  validate,
  createPost,
);

router.post(
  "/posts/:id/replies",
  verifyToken,
  [
    body("body")
      .trim().notEmpty().isLength({ min: 3, max: 1000 })
      .withMessage("La respuesta debe tener entre 3 y 1000 caracteres"),
  ],
  validate,
  createReply,
);

// ── Votar ─────────────────────────────────────────────────
router.post(
  "/posts/:id/vote",
  verifyToken,
  [body("value").isIn([1, -1]).toInt().withMessage("value debe ser 1 o -1")],
  validate,
  votePost,
);

// ── Repostear / Eliminar ──────────────────────────────────
router.post("/posts/:id/repost", verifyToken, repostPost);
router.delete("/posts/:id",      verifyToken, deletePost);

// ── Trending (público) ────────────────────────────────────
router.get(
  "/trending",
  (req, _res, next) => {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) return verifyToken(req, _res, next);
    next();
  },
  getTrending,
);

// ── Banners ───────────────────────────────────────────────
router.get("/banners", getBanners);

router.post(
  "/banners",
  verifyToken, requireAdmin,
  [
    body("title").trim().notEmpty().isLength({ max: 120 }).withMessage("Título requerido"),
    body("redirect_url").trim().isURL().withMessage("URL inválida"),
    body("description").optional().trim().isLength({ max: 500 }),
    body("svg_content").optional().trim(),
    body("is_active").optional().isBoolean().toBoolean(),
  ],
  validate,
  createBanner,
);

router.patch(
  "/banners/:id",
  verifyToken, requireAdmin,
  [
    body("title").optional().trim().isLength({ max: 120 }),
    body("redirect_url").optional().trim().isURL(),
    body("description").optional().trim().isLength({ max: 500 }),
    body("svg_content").optional().trim(),
    body("is_active").optional().isBoolean().toBoolean(),
  ],
  validate,
  updateBanner,
);

router.delete("/banners/:id", verifyToken, requireAdmin, deleteBanner);

export default router;
