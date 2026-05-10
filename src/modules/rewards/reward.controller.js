import { Reward } from "./reward.model.js";
import { Redemption } from "./redemption.model.js";
import { dbFirebase } from "../../config/firebase-admin.js";
import admin from "firebase-admin";
import { broadcastPush } from "../notifications/notification.controller.js";

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
      const userEmail = req.user.email; // Viene del token

      const reward = await Reward.findById(rewardId);
      if (!reward)
        return res.status(404).json({ message: "Beneficio no encontrado" });

      const userRef = dbFirebase.collection("users").doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists)
        return res.status(404).json({ message: "Usuario no encontrado" });

      const currentPoints = userDoc.data().points || 0;
      if (currentPoints < reward.pointsCost) {
        return res.status(400).json({ message: "Puntos insuficientes" });
      }

      await userRef.update({
        points: admin.firestore.FieldValue.increment(-reward.pointsCost),
      });

      // Guardar el registro del canje
      const redemption = new Redemption({
        userId,
        userEmail,
        rewardId,
        rewardTitle: reward.title,
        pointsCost: reward.pointsCost,
        payload,
      });
      await redemption.save();
      await pushToUser(req.user.uid, {
        title: "✅ Canje confirmado",
        body: `Tu canje de ${reward.title} fue procesado. Retiralo en administración.`,
        url: "/perfil",
        source: "rewards",
        priority: "normal",
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

  getAllRedemptions: async (req, res, next) => {
    try {
      const redemptions = await Redemption.find().sort({ createdAt: -1 });
      res.status(200).json(redemptions);
    } catch (error) {
      next(error);
    }
  },

  // GET /api/rewards/all — todos los rewards (admin, incluye inactivos)
  getAllRewards: async (req, res, next) => {
    try {
      const rewards = await Reward.find({}).sort({ pointsCost: 1 });
      res.status(200).json(rewards);
    } catch (error) {
      next(error);
    }
  },

  // PUT /api/rewards/:id — actualizar reward (admin)
  updateReward: async (req, res, next) => {
    try {
      const updated = await Reward.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
      });
      if (!updated)
        return res.status(404).json({ message: "Reward no encontrado" });
      
      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  },

  // DELETE /api/rewards/:id — eliminar reward (admin)
  deleteReward: async (req, res, next) => {
    try {
      const deleted = await Reward.findByIdAndDelete(req.params.id);
      if (!deleted)
        return res.status(404).json({ message: "Reward no encontrado" });
      res.status(200).json({ message: "Reward eliminado" });
    } catch (error) {
      next(error);
    }
  },
};
