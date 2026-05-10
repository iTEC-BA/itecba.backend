// src/modules/faq/faq.service.js
import FAQ from "./faq.model.js";

const faqService = {
  // Todas las FAQs activas, ordenadas por popularidad
  getAll: () =>
    FAQ.find({ isActive: true }).sort({ popularity: -1, createdAt: -1 }),

  // Búsqueda por texto completo + fallback regex
  search: async (query) => {
    if (!query?.trim()) return [];
    const q = query.toLowerCase().trim();

    const byText = await FAQ.find(
      { $text: { $search: q }, isActive: true },
      { score: { $meta: "textScore" } }
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(5);

    if (byText.length > 0) return byText;

    return FAQ.find({
      isActive: true,
      $or: [
        { question: { $regex: q, $options: "i" } },
        { answer:   { $regex: q, $options: "i" } },
        { keywords: { $in: [new RegExp(q, "i")] } },
      ],
    }).limit(5);
  },

  // Top 15 para contexto de la IA y sugerencias en el chat
  getTop: () =>
    FAQ.find({ isActive: true })
      .sort({ popularity: -1 })
      .limit(15),

  // CRUD admin
  create: (data, createdBy) =>
    FAQ.create({
      ...data,
      keywords:  data.keywords?.map((k) => k.toLowerCase().trim()) ?? [],
      createdBy,
    }),

  update: (id, data) =>
    FAQ.findByIdAndUpdate(id, { ...data }, { new: true, runValidators: true }),

  delete: (id) => FAQ.findByIdAndDelete(id),

  // Incrementa popularidad en 1 cada vez que una FAQ es consultada
  incrementPopularity: (id) =>
    FAQ.findByIdAndUpdate(id, { $inc: { popularity: 1 } }, { new: false }),

  getUnanswered: async () => [],
};

export default faqService;
