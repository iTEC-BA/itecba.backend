import { GoogleGenerativeAI } from "@google/generative-ai";
import AIContext from "./aiContext.model.js";
import FAQ from "../faq/faq.model.js";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const aiService = {
  getContext: async () => {
    let ctx = await AIContext.findOne({ singleton: true });
    if (!ctx) ctx = await AIContext.create({ singleton: true });
    return ctx;
  },

  updateContext: async (data) => {
    const ctx = await AIContext.findOneAndUpdate(
      { singleton: true },
      { $set: data },
      { new: true, upsert: true }
    );
    return ctx;
  },

  buildSystemPrompt: async () => {
    const ctx = await aiService.getContext();
    const topFaqs = await FAQ.find({ isActive: true }).sort({ popularity: -1 }).limit(15);

    const faqSection = topFaqs.length > 0
      ? `\n\nPREGUNTAS FRECUENTES DE LA PLATAFORMA:\n${topFaqs.map(f => `P: ${f.question}\nR: ${f.answer}`).join("\n\n")}`
      : "";

    const rulesSection = ctx.rules?.length > 0
      ? `\n\nREGLAS:\n${ctx.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
      : "";

    return `${ctx.personality}\n\n${ctx.institutionalContext}${faqSection}${rulesSection}\n\nIMPORTANTE: Respondé ÚNICAMENTE sobre temas relacionados con UTN FRBA, ITEC BA y la plataforma estudiantil. Si la pregunta no está relacionada, explicalo amablemente. No inventes información. Respondé en español.`;
  },

  chat: async (message, history = []) => {
    const systemPrompt = await aiService.buildSystemPrompt();
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: systemPrompt,
    });

    const chat = model.startChat({
      history: history.slice(-8).map(h => ({
        role: h.role === "user" ? "user" : "model",
        parts: h.parts || [{ text: h.text || "" }],
      })),
      generationConfig: { maxOutputTokens: 800, temperature: 0.7 },
    });

    const result = await chat.sendMessage(message);
    return result.response.text();
  },
};

export default aiService;
