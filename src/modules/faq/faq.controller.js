import faqService from "./faq.service.js"; // ← antes: import { aqService } from "./faq.service"

const faqController = {
  getAll: async (req, res) => {
    try {
      const faqs = await faqService.getAll();
      res.json(faqs);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },

  search: async (req, res) => {
    try {
      const results = await faqService.search(req.query.q);
      res.json(results);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },

  getTop: async (req, res) => {
    try {
      res.json(await faqService.getTop());
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },

  create: async (req, res) => {
    try {
      const faq = await faqService.create(req.body, req.user?.uid);
      res.status(201).json(faq);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  },

  update: async (req, res) => {
    try {
      const faq = await faqService.update(req.params.id, req.body);
      if (!faq) return res.status(404).json({ error: "FAQ no encontrada" });
      res.json(faq);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  },

  delete: async (req, res) => {
    try {
      await faqService.delete(req.params.id);
      res.json({ message: "FAQ eliminada" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  },

  trackUse: async (req, res) => {
    try {
      await faqService.incrementPopularity(req.params.id);
      res.json({ ok: true });
    } catch {
      res.json({ ok: false });
    }
  },
};

export default faqController; // ← antes: module.exports = faqController
