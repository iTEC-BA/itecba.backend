import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ── Validación temprana (igual que firebase-admin.js) ────────
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    "🔴 Variables de entorno faltantes: SUPABASE_URL y/o SUPABASE_SERVICE_KEY",
  );
  process.exit(1);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }, // En server-side no necesitamos persistir sesión
});

/**
 * Verifica la conexión a Supabase ejecutando una query mínima.
 * Se llama desde src/index.js al arrancar el servidor.
 */
export async function checkSupabaseConnection() {
  // Intenta leer 1 fila de calendar_events para verificar conexión Y que la tabla existe.
  const { error } = await supabase
    .from("calendar_events")
    .select("id")
    .limit(1);

  if (error) {
    // Código 42P01 = tabla no existe (PostgreSQL)
    if (error.code === "42P01") {
      console.error("🔴 [SUPABASE] La tabla 'calendar_events' no existe.");
    } else {
      console.error("🔴 [SUPABASE] Error de conexión:", error.message);
      console.error(
        "   Verificá que el proyecto Supabase no esté pausado (free tier se pausa a los 7 días).",
      );
    }
    // En producción preferimos arrancar igual pero loguear el error;
    // si querés que falle hard, descomentá la siguiente línea:
    // process.exit(1);
    return false;
  }

  console.log("🟢 Supabase conectado");
  return true;
}
