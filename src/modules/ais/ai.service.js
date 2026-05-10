// src/modules/ais/ai.service.js
// Servicio de IA usando GROQ API (OpenAI-compatible endpoint)
// Cache de 5 min para el system prompt; FAQs top-15 + calendario en contexto.

import AIContext from "./aiContext.model.js";
import FAQ       from "../faq/faq.model.js";
import { supabase } from "../../config/supabase.js";

const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant"; // Rápido, eficiente, bajo costo

// ── Cache del system prompt (TTL = 5 min) ────────────────────────────────────
let _promptCache  = null;
let _promptCacheTs = 0;
const CACHE_TTL   = 5 * 60 * 1000;

/**
 * Construye (o devuelve del cache) el system prompt completo:
 *   - Personalidad + contexto institucional + reglas  (MongoDB)
 *   - Top 15 FAQs más consultadas                    (MongoDB)
 *   - Próximos eventos del calendario académico       (Supabase)
 */
const buildSystemPrompt = async () => {
  const now = Date.now();
  if (_promptCache && now - _promptCacheTs < CACHE_TTL) return _promptCache;

  // ── Contexto institucional ────────────────────────────────────────────────
  let ctx = await AIContext.findOne({ singleton: true }).lean();
  if (!ctx) {
    ctx = {
      personality:           "Soy el asistente virtual de ITEC BA, la plataforma estudiantil de UTN FRBA.",
      institutionalContext:  "UTN FRBA (Facultad Regional Buenos Aires) es parte de la Universidad Tecnológica Nacional. ITEC BA es la plataforma digital oficial para estudiantes.",
      rules: [
        "Solo respondo sobre UTN FRBA, trámites académicos, materias, grupos, horarios, SIU Guaraní y la plataforma ITEC BA.",
        "Soy conciso, amable y directo. Uso markdown para mejorar la legibilidad.",
        "Si no tengo información exacta, recomiendo consultar a la Secretaría Académica o a docentes.",
        "No invento información. Si no sé algo, lo digo claramente.",
      ],
    };
  }

  const rulesText = Array.isArray(ctx.rules) && ctx.rules.length
    ? ctx.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")
    : "1. Solo respondo sobre UTN FRBA y la plataforma ITEC BA.\n2. Soy directo y uso markdown.";

  // ── Top 15 FAQs ──────────────────────────────────────────────────────────
  const topFaqs = await FAQ.find({ isActive: true })
    .sort({ popularity: -1 })
    .limit(15)
    .lean();

  const faqSection = topFaqs.length
    ? topFaqs.map((f, i) => {
        // Truncar respuestas largas para no exceder tokens
        const ans = f.answer.length > 300 ? f.answer.slice(0, 297) + "…" : f.answer;
        return `${i + 1}. **P:** ${f.question}\n   **R:** ${ans}`;
      }).join("\n\n")
    : "(Aún no hay FAQs cargadas en la base de datos)";

  // ── Calendario académico desde Supabase ───────────────────────────────────
  let calendarSection = "";
  try {
    const today = new Date().toISOString().split("T")[0];
    const { data: events, error } = await supabase
      .from("calendar_events")
      .select("title, subtitle, date, type")
      .gte("date", today)
      .order("date", { ascending: true })
      .limit(25);

    if (!error && events?.length) {
      calendarSection = "\n\n## 📅 Próximos eventos del calendario académico\n" +
        events.map(e => {
          const sub = e.subtitle ? ` — ${e.subtitle}` : "";
          return `- \`${e.date}\` [${e.type}] **${e.title}**${sub}`;
        }).join("\n");
    }
  } catch (err) {
    console.warn("[AI] No se pudo cargar el calendario:", err.message);
  }

  // ── Prompt final ─────────────────────────────────────────────────────────
  const prompt = `${ctx.personality}

## Contexto institucional
${ctx.institutionalContext}

## Reglas de comportamiento
${rulesText}

## 🔥 FAQs más consultadas por estudiantes
${faqSection}${calendarSection}

---
Respondé en español argentino. Usá markdown (negritas, listas, etc.) para claridad. Si te preguntan por una fecha concreta, buscá en el calendario de arriba. Si no encontrás la fecha, decí que no la tenés y sugerí consultar en itec.ba/calendario.`;

  _promptCache  = prompt;
  _promptCacheTs = Date.now();
  console.log("[AI] System prompt reconstruido y cacheado.");
  return prompt;
};

// ── Servicio principal ────────────────────────────────────────────────────────
const aiService = {
  /**
   * Envía un mensaje a GROQ y devuelve la respuesta en texto.
   * @param {string} message   - Mensaje del usuario
   * @param {Array}  history   - Historial previo en formato Gemini/ITEC
   */
  chat: async (message, history = []) => {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY no está configurada en las variables de entorno.");
    }

    const systemPrompt = await buildSystemPrompt();

    // Convertir historial formato Gemini → formato OpenAI
    const historyMessages = history.slice(-10).map(h => ({
      role:    h.role === "model" ? "assistant" : h.role,
      content: h.parts?.[0]?.text ?? h.content ?? "",
    }));

    const messages = [
      { role: "system",    content: systemPrompt },
      ...historyMessages,
      { role: "user",      content: message },
    ];

    const res = await fetch(GROQ_URL, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model:       GROQ_MODEL,
        messages,
        max_tokens:  800,
        temperature: 0.65,
        stream:      false,
        // Cumplir rate limits de GROQ: max 6000 tokens/min en free tier
      }),
      signal: AbortSignal.timeout(25_000), // 25s timeout
    });

    if (!res.ok) {
      let errBody = {};
      try { errBody = await res.json(); } catch (_) {}
      const msg = errBody?.error?.message || `GROQ HTTP ${res.status}`;

      // Rate limit específico de GROQ
      if (res.status === 429) {
        throw new Error("El asistente está recibiendo muchas consultas. Esperá un momento e intentá de nuevo.");
      }
      throw new Error(msg);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() ?? "No pude generar una respuesta en este momento.";
  },

  /**
   * Devuelve el documento de contexto IA (o crea uno por defecto).
   */
  getContext: async () => {
    let ctx = await AIContext.findOne({ singleton: true });
    if (!ctx) {
      ctx = await AIContext.create({ singleton: true });
    }
    return ctx;
  },

  /**
   * Actualiza personalidad / contexto / reglas / aiCost.
   * Limpia el cache automáticamente para que aplique de inmediato.
   */
  updateContext: async (data) => {
    const allowed = ["personality", "institutionalContext", "rules", "aiCost"];
    const update  = {};
    for (const key of allowed) {
      if (data[key] !== undefined) update[key] = data[key];
    }

    const ctx = await AIContext.findOneAndUpdate(
      { singleton: true },
      update,
      { upsert: true, new: true, runValidators: true }
    );

    // Limpiar cache para aplicar cambios inmediatamente
    _promptCache  = null;
    _promptCacheTs = 0;
    console.log("[AI] Contexto actualizado. Cache limpiado.");
    return ctx;
  },

  /**
   * Limpia el cache del system prompt manualmente (desde el panel admin).
   */
  clearCache: () => {
    _promptCache  = null;
    _promptCacheTs = 0;
    console.log("[AI] Cache limpiado manualmente.");
  },
};

export default aiService;
