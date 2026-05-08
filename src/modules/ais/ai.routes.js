import { Router }      from "express";
import { body }        from "express-validator";
import { validate }    from "../../middlewares/validate.js";
import { verifyToken } from "../../middlewares/authMiddleware.js";
import { generateAIResponse } from "./ai.service.js";
import { dbFirebase }  from "../../config/firebase-admin.js";

const router = Router();

/* ── POST /api/ai/chat ─────────────────────────────────────────────────────
   Genera respuesta de IA. Requiere token (verifyToken).
   El frontend ya descontó los puntos antes de llamar este endpoint.
─────────────────────────────────────────────────────────────────────────── */
router.post(
  "/chat",
  verifyToken,
  [
    body("message")
      .trim()
      .notEmpty().withMessage("El mensaje no puede estar vacío")
      .isLength({ max: 2000 }).withMessage("Mensaje demasiado largo (máx. 2000 caracteres)"),
    body("history")
      .optional()
      .isArray({ max: 20 }).withMessage("Historial inválido"),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { message, history = [] } = req.body;
      const response = await generateAIResponse(message, history);
      res.json({ response });
    } catch (err) {
      next(err);
    }
  }
);

/* ── PATCH /api/ai/deduct-points ─────────────────────────────────────────
   El usuario autenticado descuenta AI_POINTS_COST puntos de su propio perfil.
   Valida que tenga puntos suficientes antes de descontar.
   Nota: el frontend también hace esto via Firestore directo como fallback,
   pero tener el endpoint permite centralizar la lógica en el futuro.
─────────────────────────────────────────────────────────────────────────── */
const AI_POINTS_COST = 5;

router.patch(
  "/deduct-points",
  verifyToken,
  async (req, res, next) => {
    try {
      const uid = req.user.uid;
      const ref = dbFirebase.collection("users").doc(uid);
      const snap = await ref.get();

      if (!snap.exists) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }

      const current = snap.data().points ?? 0;

      if (current < AI_POINTS_COST) {
        return res.status(402).json({
          message: `Puntos insuficientes. Necesitás ${AI_POINTS_COST}, tenés ${current}.`,
          points: current,
        });
      }

      const newTotal = current - AI_POINTS_COST;
      await ref.set({ points: newTotal }, { merge: true });

      res.json({ points: newTotal, deducted: AI_POINTS_COST });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
