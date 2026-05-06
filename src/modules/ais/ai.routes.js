import { Router } from "express";
import { body }   from "express-validator";
import { validate }       from "../../middlewares/validate.js";
import { verifyToken }    from "../../middlewares/authMiddleware.js";
import { generateAIResponse } from "./ai.service.js";

const router = Router();

router.post(
  "/chat",
  verifyToken, // El chatbot requiere estar logueado para evitar abuso
  [
    body("message")
      .trim()
      .notEmpty().withMessage("El mensaje no puede estar vacío")
      .isLength({ max: 1000 }).withMessage("Mensaje demasiado largo (máx. 1000 caracteres)"),
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

export default router;
