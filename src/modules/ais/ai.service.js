// import { GoogleGenerativeAI } from "@google/generative-ai";
// import dotenv from "dotenv";

// dotenv.config();

// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// const SYSTEM_INSTRUCTION = `
// Eres 'ITEC Bot', el asistente virtual oficial de ITEC UTN BA.
// Tu objetivo es ayudar a estudiantes con dudas sobre la Universidad Tecnológica Nacional (UTN).
// Responde de manera amable, directa y usando lenguaje natural argentino (vos).
// REGLA ESTRICTA: Solo puedes hablar sobre temas universitarios, académicos y de la UTN.
// `;

// export const generateAIResponse = async (userText, history = []) => {
//   try {
//     console.log("🤖 Consultando a Gemini. Mensaje del usuario:", userText);

//     const model = genAI.getGenerativeModel({
//       model: "gemini-2.0-flash",
//       systemInstruction: SYSTEM_INSTRUCTION,
//     });

//     const chat = model.startChat({ history });
//     const result = await chat.sendMessage(userText);

//     console.log("✅ Respuesta generada con éxito");
//     return result.response.text();
//   } catch (error) {
//     console.error("🚨 ERROR CRÍTICO AL CONECTAR CON GEMINI:");
//     console.error(error);
//     throw new Error("No se pudo generar la respuesta de la IA.");
//   }
// };
import dotenv from "dotenv";
dotenv.config();

const SYSTEM_INSTRUCTION = `
Eres 'ITEC Bot', el asistente virtual experto y oficial de la plataforma ITEC UTN BA.

¿QUÉ ES ITEC?
ITEC es una comunidad y plataforma web creada de forma independiente por y para estudiantes de la Universidad Tecnológica Nacional, Facultad Regional Buenos Aires (UTN BA). Su propósito es facilitar la vida universitaria centralizando herramientas clave.

¿QUÉ OFRECE LA PLATAFORMA ITEC?
1. Cursos: Material audiovisual, videos y guías para aprender los temas de las materias.
2. Comunidades (Grupos): Una sección para encontrar links de grupos de WhatsApp de distintas materias y comisiones.
3. Aportes (Recursos): Un repositorio donde los alumnos comparten resúmenes, parciales y finales.
4. Progreso: Una herramienta de seguimiento (Dashboard) donde el estudiante anota sus materias aprobadas y ve su promedio.
5. TarjeTec: Un sistema de gamificación donde los usuarios ganan puntos por subir aportes a la comunidad.

REGLAS DE TU COMPORTAMIENTO:
- Responde de manera amable, empática, directa y usando lenguaje natural argentino (vos).
- Si el usuario te pasa "Contexto Oficial", úsalo como tu fuente principal de verdad.
- Solo puedes hablar sobre temas universitarios, académicos, de la UTN y de ITEC.
`;

export const generateAIResponse = async (userText, history = []) => {
  try {
    console.log("🤖 Consultando a GROQ (LLaMA 3.1)...");

    // Formateamos el historial
    const formattedHistory = history.map((msg) => ({
      role: msg.role === "model" ? "assistant" : "user",
      content: msg.parts[0].text,
    }));

    // Insertamos sistema y pregunta actual
    formattedHistory.unshift({ role: "system", content: SYSTEM_INSTRUCTION });
    formattedHistory.push({ role: "user", content: userText });

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: formattedHistory,
          temperature: 0.5,
        }),
      },
    );

    // 🟢 AQUÍ ESTÁ EL DETECTOR DE ERRORES MEJORADO
    if (!response.ok) {
      const errorDetails = await response.text(); // Capturamos qué dijo Groq exactamente
      console.error("\n🚨 DETALLES DEL ERROR DE GROQ:");
      console.error(errorDetails, "\n");
      throw new Error("Petición rechazada por Groq");
    }

    const data = await response.json();
    console.log("✅ Respuesta generada con éxito");

    return data.choices[0].message.content;
  } catch (error) {
    console.error("🚨 ERROR CRÍTICO AL CONECTAR CON LA IA:", error);
    throw new Error("No se pudo generar la respuesta de la IA.");
  }
};
