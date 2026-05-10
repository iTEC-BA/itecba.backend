// src/modules/forum/forum.routes.js
import { Router }                       from "express";
import { body, query, param }           from "express-validator";
import { validate }                     from "../../middlewares/validate.js";
import { verifyToken, requireAdmin }    from "../../middlewares/authMiddleware.js";
import {
  getPosts,
  getThread,
  createPost,
  createReply,
  votePost,
  repostPost,
  getTrending,
  deletePost,
  getBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  savePushSubscription,
  getVapidPublicKey,
} from "./forum.controller.js";

const router = Router();

// ── Push ─────────────────────────────────────────────────────────────────────
router.get("/push/vapid-key",    getVapidPublicKey);
router.post("/push/subscribe",   verifyToken, savePushSubscription);

// ── Feed y posts ─────────────────────────────────────────────────────────────
router.get(
  "/posts",
  [
    query("page").optional().isInt({ min: 1 }).toInt(),
    query("tab").optional().isIn(["para-ti", "siguiendo", "utn-ba", "tendencias"]),
  ],
  validate,
  getPosts,
);

router.get("/posts/:id",  getThread);

router.post(
  "/posts",
  verifyToken,
  [
    body("body").trim().notEmpty().isLength({ min: 3, max: 1000 })
      .withMessage("El contenido debe tener entre 3 y 1000 caracteres"),
    body("parent_id").optional().isInt({ min: 1 }).toInt(),
  ],
  validate,
  createPost,
);

router.post(
  "/posts/:id/replies",
  verifyToken,
  [body("body").trim().notEmpty().isLength({ min: 3, max: 1000 })],
  validate,
  createReply,
);

router.post(
  "/posts/:id/vote",
  verifyToken,
  [body("value").isIn([1, -1]).toInt()],
  validate,
  votePost,
);

router.post("/posts/:id/repost", verifyToken, repostPost);   // ← NUEVO

router.delete("/posts/:id", verifyToken, deletePost);

// ── Trending ─────────────────────────────────────────────────────────────────
router.get("/trending", getTrending);                         // ← NUEVO

// ── Banners CRUD ─────────────────────────────────────────────────────────────
router.get("/banners", getBanners);                           // ← NUEVO

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
);                                                            // ← NUEVO

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
);                                                            // ← NUEVO

router.delete("/banners/:id", verifyToken, requireAdmin, deleteBanner); // ← NUEVO

export default router;
