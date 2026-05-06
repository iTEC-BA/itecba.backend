import dotenv from "dotenv";
dotenv.config();

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL    = "llama-3.1-8b-instant";

const SYSTEM_PROMPT = `
Sos 'ITEC Bot', el asistente virtual oficial de ITEC BA — la plataforma estudiantil
de la UTN Facultad Regional Buenos Aires, creada por y para estudiantes.

PLATAFORMA ITEC BA:
- Cursos: videos y guías para aprender los temas de las materias
- Grupos: links de WhatsApp por materia y comisión
- Aportes (Recursos): resúmenes, parciales y finales de la comunidad
- Progreso: dashboard para seguir materias aprobadas y promedio
- TarjeTEC: sistema de puntos por aportar a la comunidad

REGLAS:
- Respondé en español rioplatense (vos, che), de forma directa y amigable
- Solo hablás sobre temas universitarios, académicos y de la UTN / ITEC BA
- Si te pasan "Contexto Oficial", usalo como fuente principal
- Si no sabés algo, decilo sin inventar
`.trim();

export const generateAIResponse = async (userText, history = []) => {
  if (!process.env.GROQ_API_KEY) {
    throw Object.assign(new Error("GROQ_API_KEY no configurada"), { statusCode: 503 });
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    // Convertimos el historial del formato Gemini al formato OpenAI
    ...history.map((msg) => ({
      role:    msg.role === "model" ? "assistant" : "user",
      content: msg.parts?.[0]?.text ?? msg.content ?? "",
    })),
    { role: "user", content: userText },
  ];

  const response = await fetch(GROQ_URL, {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model:       MODEL,
      messages,
      temperature: 0.5,
      max_tokens:  800, // Límite razonable para free tier
    }),
    signal: AbortSignal.timeout(30_000), // 30s timeout
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Groq error:", response.status, detail);
    throw Object.assign(
      new Error("El servicio de IA no está disponible. Intentá más tarde."),
      { statusCode: 503 }
    );
  }

  const data = await response.json();
  return data.choices[0].message.content;
};
