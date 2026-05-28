// src/modules/faq/faq.controller.js
import faqService from "./faq.service.js";
import { notFound } from "../../middlewares/errorHandler.js";

const faqController = {
  getAll: async (req, res, next) => {
    try {
      const faqs = await faqService.getAll();
      res.json(faqs);
    } catch (e) { next(e); }
  },

  search: async (req, res, next) => {
    try {
      const results = await faqService.search(req.query.q);
      res.json(results);
    } catch (e) { next(e); }
  },

  getTop: async (req, res, next) => {
    try {
      res.json(await faqService.getTop());
    } catch (e) { next(e); }
  },

  create: async (req, res, next) => {
    try {
      const faq = await faqService.create(req.body, req.user?.uid);
      res.status(201).json(faq);
    } catch (e) { next(e); }
  },

  update: async (req, res, next) => {
    try {
      const faq = await faqService.update(req.params.id, req.body);
      if (!faq) return next(notFound("FAQ no encontrada"));
      res.json(faq);
    } catch (e) { next(e); }
  },

  delete: async (req, res, next) => {
    try {
      const doc = await faqService.delete(req.params.id);
      if (!doc) return next(notFound("FAQ no encontrada"));
      res.json({ message: "FAQ eliminada" });
    } catch (e) { next(e); }
  },

  trackUse: async (req, res, next) => {
    try {
      await faqService.incrementPopularity(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      // Silencioso — no romper la experiencia del usuario por un fallo de tracking
      console.warn("[FAQ] trackUse error:", e.message);
      res.json({ ok: false });
    }
  },
};

export default faqController;
