import aiService from "./ai.service.js";
import admin from "firebase-admin";

const aiController = {
  chat: async (req, res) => {
    try {
      const { message, history = [] } = req.body;
      if (!message?.trim())
        return res.status(400).json({ error: "Mensaje requerido" });
      const response = await aiService.chat(message, history);
      res.json({ response });
    } catch (e) {
      console.error("[AI] Error:", e.message);
      res
        .status(500)
        .json({ error: "Error al procesar la consulta", details: e.message });
    }
  },

  deductPoints: async (req, res) => {
    try {
      const { points = 2 } = req.body;
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "No autenticado" });

      const db = admin.firestore();
      const userRef = db.collection("users").doc(uid);
      const snap = await userRef.get();
      if (!snap.exists)
        return res.status(404).json({ error: "Usuario no encontrado" });

      const current = snap.data().points ?? 0;
      if (current < points)
        return res.status(400).json({ error: "Puntos insuficientes", current });

      await userRef.update({
        points: admin.firestore.FieldValue.increment(-points),
      });
      res.json({ ok: true, newBalance: current - points });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },

  getContext: async (req, res) => {
    try {
      res.json(await aiService.getContext());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },

  updateContext: async (req, res) => {
    try {
      res.json(await aiService.updateContext(req.body));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  },
};

export default aiController;
