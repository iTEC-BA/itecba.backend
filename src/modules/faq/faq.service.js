// ✅ CORRECCIONES:
// 1. import default (no nombrado) porque faq.model exporta "export default mongoose.model(...)"
// 2. Extensión .js agregada (requerida en ESM con "type":"module")
// 3. module.exports → export default  (el proyecto es ESM puro)

import FAQ from "./faq.model.js"; // ← antes: import { FAQ } from "./faq.model"

const faqService = {
  getAll: () =>
    FAQ.find({ isActive: true }).sort({ popularity: -1, createdAt: -1 }),

  search: async (query) => {
    if (!query?.trim()) return [];
    const q = query.toLowerCase().trim();
    // Búsqueda por texto completo + fallback por keywords
    const byText = await FAQ.find(
      { $text: { $search: q }, isActive: true },
      { score: { $meta: "textScore" } },
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(5);

    if (byText.length > 0) return byText;

    // Fallback: búsqueda parcial
    return FAQ.find({
      isActive: true,
      $or: [
        { question: { $regex: q, $options: "i" } },
        { answer: { $regex: q, $options: "i" } },
        { keywords: { $in: [new RegExp(q, "i")] } },
      ],
    }).limit(5);
  },

  getTop: () => FAQ.find({ isActive: true }).sort({ popularity: -1 }).limit(8),

  create: (data, createdBy) =>
    FAQ.create({
      ...data,
      keywords: data.keywords?.map((k) => k.toLowerCase().trim()) ?? [],
      createdBy,
    }),

  update: (id, data) =>
    FAQ.findByIdAndUpdate(id, { ...data }, { new: true, runValidators: true }),

  delete: (id) => FAQ.findByIdAndDelete(id),

  incrementPopularity: (id) =>
    FAQ.findByIdAndUpdate(id, { $inc: { popularity: 1 } }),

  getUnanswered: async () => {
    // Placeholder: en producción se guardarían las búsquedas sin respuesta en una colección separada
    return [];
  },
};

export default faqService; // ← antes: module.exports = faqService
