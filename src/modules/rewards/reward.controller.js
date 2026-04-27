import { Reward } from "./reward.model.js";
import { dbFirebase } from "../../config/firebase-admin.js";
import admin from "firebase-admin";

export const rewardController = {
  getRewards: async (req, res, next) => {
    try {
      const rewards = await Reward.find({ isActive: true }).sort({
        pointsCost: 1,
      });
      res.status(200).json(rewards);
    } catch (error) {
      next(error);
    }
  },

  createReward: async (req, res, next) => {
    try {
      const newReward = new Reward(req.body);
      await newReward.save();
      res.status(201).json(newReward);
    } catch (error) {
      next(error);
    }
  },

  redeemReward: async (req, res, next) => {
    try {
      const { rewardId, payload } = req.body;
      const userId = req.user.uid;

      // 1. Verificar si el beneficio existe en MongoDB
      const reward = await Reward.findById(rewardId);
      if (!reward)
        return res.status(404).json({ message: "Beneficio no encontrado" });

      // 2. Traer el usuario de TU base de datos de Firestore
      const userRef = dbFirebase.collection("users").doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists)
        return res.status(404).json({ message: "Usuario no encontrado" });

      const userData = userDoc.data();
      const currentPoints = userData.points || 0;

      // 3. Validar puntos
      if (currentPoints < reward.pointsCost) {
        return res.status(400).json({ message: "Puntos insuficientes" });
      }

      // 4. Descontar puntos atómicamente en Firestore
      await userRef.update({
        points: admin.firestore.FieldValue.increment(-reward.pointsCost),
      });

      res.status(200).json({
        success: true,
        newBalance: currentPoints - reward.pointsCost,
        message: "Canje exitoso",
      });
    } catch (error) {
      next(error);
    }
  },
};
