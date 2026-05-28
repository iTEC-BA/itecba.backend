// src/modules/ais/ai.controller.js
import aiService from "./ai.service.js";
import admin     from "firebase-admin";

const aiController = {

  // POST /api/ai/chat — consulta IA avanzada (requiere verifyToken)
  chat: async (req, res) => {
    try {
      const { message, history = [] } = req.body;
      if (!message?.trim())
        return res.status(400).json({ error: "Mensaje requerido" });

      const response = await aiService.chat(message, history);
      res.json({ response });
    } catch (e) {
      console.error("[AI] chat error:", e.message);
      const status = e.message.includes("espera") ? 429 : 500;
      res.status(status).json({ error: e.message });
    }
  },

  // PATCH /api/ai/deduct-points — descuenta puntos al usuario
  deductPoints: async (req, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "No autenticado" });

      // Leer costo actual desde la DB (respeta el costo configurable)
      const ctx    = await aiService.getContext();
      const cost   = ctx.aiCost ?? 2;
      // También aceptar el valor del body si se envía (compatibilidad)
      const points = Math.max(1, Number(req.body.points ?? cost));

      const db      = admin.firestore();
      const userRef = db.collection("users").doc(uid);

      // ── Transacción atómica para evitar race condition ─────────────────────
      let newBalance;
      try {
        newBalance = await db.runTransaction(async (tx) => {
          const snap = await tx.get(userRef);
          if (!snap.exists) throw Object.assign(new Error("Usuario no encontrado"), { code: 404 });
          const current = snap.data().points ?? 0;
          if (current < points) throw Object.assign(new Error("Puntos insuficientes"), { code: 400, current });
          tx.update(userRef, { points: admin.firestore.FieldValue.increment(-points) });
          return current - points;
        });
      } catch (txErr) {
        const status = txErr.code === 404 ? 404 : txErr.code === 400 ? 400 : 500;
        return res.status(status).json({ error: txErr.message, current: txErr.current });
      }
      res.json({ ok: true, newBalance });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },

  // GET /api/ai/context — lee personalidad + reglas + aiCost
  getContext: async (req, res) => {
    try {
      res.json(await aiService.getContext());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },

  // PATCH /api/ai/context — actualiza contexto (solo admin)
  updateContext: async (req, res) => {
    try {
      res.json(await aiService.updateContext(req.body));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  },

  // POST /api/ai/clear-cache — limpia cache del prompt (solo admin)
  clearCache: async (req, res) => {
    try {
      aiService.clearCache();
      res.json({ ok: true, message: "Cache del system prompt limpiado. Los cambios aplican en la próxima consulta." });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },
};

export default aiController;
