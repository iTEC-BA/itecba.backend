import { Benefit } from "./benefit.model.js";
import { Redemption } from "./redemption.model.js";
import { badRequest, notFound } from "../../middlewares/errorHandler.js";
import { dbFirebase } from "../../config/firebase-admin.js";
import admin from "firebase-admin";
import { broadcastPush, pushToUser } from "../notifications/notification.controller.js";

export const getBenefits = async (req, res, next) => {
  try {
    const filter = { isActive: true };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.type === "free") filter.pointsCost = 0;
    if (req.query.type === "points") filter.pointsCost = { $gt: 0 };

    const benefits = await Benefit.find(filter).sort({ pointsCost: 1, order: 1, createdAt: -1 });
    res.status(200).json({ benefits });
  } catch (err) { next(err); }
};

export const getAllBenefits = async (req, res, next) => {
  try {
    const benefits = await Benefit.find().sort({ pointsCost: 1, category: 1, order: 1 });
    res.status(200).json({ benefits });
  } catch (err) { next(err); }
};

export const createBenefit = async (req, res, next) => {
  try {
    const { title, description, discount, location, category, img, icon, pointsCost, order } = req.body;
    if (!title) return next(badRequest("title es requerido"));

    const benefit = await Benefit.create({
      title, description, discount, location, category, img, icon,
      pointsCost: pointsCost || 0, order: order || 0,
    });

    await broadcastPush({
      title: benefit.pointsCost > 0 ? "🎁 Nueva recompensa" : "🎁 Nuevo beneficio",
      body: benefit.pointsCost > 0 
        ? `${title} — Canjealo por ${benefit.pointsCost} pts` 
        : `${title} — Descuento exclusivo para estudiantes iTEC`,
      url: "/beneficios",
      source: "benefits",
      priority: "normal",
    });

    res.status(201).json({ benefit });
  } catch (err) { next(err); }
};

export const updateBenefit = async (req, res, next) => {
  try {
    const benefit = await Benefit.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!benefit) return next(notFound("Beneficio no encontrado"));
    res.status(200).json({ benefit });
  } catch (err) { next(err); }
};

export const deleteBenefit = async (req, res, next) => {
  try {
    const benefit = await Benefit.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!benefit) return next(notFound("Beneficio no encontrado"));
    res.status(200).json({ message: "Beneficio desactivado", benefit });
  } catch (err) { next(err); }
};

export const redeemBenefit = async (req, res, next) => {
  try {
    const { benefitId, payload } = req.body;
    const userId = req.user.uid;
    const userEmail = req.user.email;

    const benefit = await Benefit.findById(benefitId);
    if (!benefit || !benefit.isActive) return next(notFound("Beneficio no encontrado"));

    if (!benefit.pointsCost || benefit.pointsCost <= 0) {
      return next(badRequest("Este beneficio es de acceso libre y no requiere canje de puntos."));
    }

    const userRef = dbFirebase.collection("users").doc(userId);
    let newBalance;
    
    try {
      newBalance = await dbFirebase.runTransaction(async (tx) => {
        const userDoc = await tx.get(userRef);
        if (!userDoc.exists) throw Object.assign(new Error("Usuario no encontrado"), { code: 404 });
        const currentPoints = userDoc.data().points || 0;
        if (currentPoints < benefit.pointsCost) throw Object.assign(new Error("Puntos insuficientes"), { code: 400 });
        
        tx.update(userRef, { points: admin.firestore.FieldValue.increment(-benefit.pointsCost) });
        return currentPoints - benefit.pointsCost;
      });
    } catch (txErr) {
      return res.status(txErr.code || 500).json({ error: true, message: txErr.message });
    }

    const redemption = await Redemption.create({
      userId, userEmail, benefitId, benefitTitle: benefit.title,
      pointsCost: benefit.pointsCost, payload,
    });

    await pushToUser(userId, {
      title: "✅ Canje confirmado",
      body: `Tu canje de ${benefit.title} fue procesado. Retiralo en administración.`,
      url: "/beneficios",
      source: "benefits",
      priority: "normal",
    });

    res.status(200).json({ success: true, newBalance, message: "Canje exitoso", redemption });
  } catch (err) { next(err); }
};

export const getAllRedemptions = async (req, res, next) => {
  try {
    const redemptions = await Redemption.find().sort({ createdAt: -1 });
    res.status(200).json({ redemptions });
  } catch (err) { next(err); }
};
