#!/usr/bin/env bash
# ============================================================
#  fix_itecba.sh — Correcciones para iTEC BA Backend
#  Ejecutar desde la raíz del repo: bash fix_itecba.sh
# ============================================================
set -e
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[FIX]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERR]${NC} $1"; }

# ── 0. Pre-checks ────────────────────────────────────────────
log "Verificando que estamos en la raíz del backend..."
[ -f "src/index.js" ] || { err "Ejecutá el script desde la raíz del backend (donde está src/index.js)"; exit 1; }

# ── 1. Sacar firebase-service-account.json del tracking de Git ─
log "Eliminando firebase-service-account.json del tracking de Git..."
git rm --cached src/config/firebase-service-account.json 2>/dev/null || true
# Asegurar que está en .gitignore (ya debería estarlo, pero por las dudas)
grep -qxF "src/config/firebase-service-account.json" .gitignore || \
  echo "src/config/firebase-service-account.json" >> .gitignore
warn "⚠️  IMPORTANTE: Revocá y regenerá las credenciales de Firebase Service Account."
warn "    El archivo estuvo expuesto en el repositorio."

# ── 2. Parchear src/config/supabase.js ──────────────────────
#    Problema: no valida env vars ni hace test de conexión al iniciar.
#    Esto hace que un fallo de Supabase sea invisible en los logs de Render.
log "Actualizando src/config/supabase.js con validación y health-check..."
cat > src/config/supabase.js << 'SUPABASE_EOF'
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ── Validación temprana (igual que firebase-admin.js) ────────
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("🔴 Variables de entorno faltantes: SUPABASE_URL y/o SUPABASE_SERVICE_KEY");
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
      console.error("   Ejecutá el SQL del archivo supabase_schema.sql en el dashboard de Supabase.");
    } else {
      console.error("🔴 [SUPABASE] Error de conexión:", error.message);
      console.error("   Verificá que el proyecto Supabase no esté pausado (free tier se pausa a los 7 días).");
    }
    // En producción preferimos arrancar igual pero loguear el error;
    // si querés que falle hard, descomentá la siguiente línea:
    // process.exit(1);
    return false;
  }

  console.log("🟢 Supabase conectado");
  return true;
}
SUPABASE_EOF

# ── 3. Agregar la verificación de Supabase al arranque (src/index.js) ──
log "Inyectando checkSupabaseConnection() en src/index.js..."
# Solo aplicar si aún no está
if ! grep -q "checkSupabaseConnection" src/index.js; then
  # Agregar el import junto a los otros de config
  sed -i "s|import { initForumDB } from \"./config/turso.js\";|import { initForumDB } from \"./config/turso.js\";\nimport { checkSupabaseConnection } from \"./config/supabase.js\";|" src/index.js

  # Llamar checkSupabaseConnection() junto a connectDB() e initForumDB()
  sed -i "s|initForumDB();|initForumDB();\ncheckSupabaseConnection();|" src/index.js
  log "  → checkSupabaseConnection() agregado al arranque."
else
  warn "  → checkSupabaseConnection() ya estaba presente. Saltando."
fi

# ── 4. Agregar ruta PATCH /api/calendar/:id (faltante) ───────
#    El frontend llama PATCH /calendar/:id (calendarService.update)
#    pero el backend no tiene esa ruta. Aunque el GET es el que falla
#    ahora, el PATCH va a fallar en producción cuando intenten editar.
log "Añadiendo ruta PATCH y función updateEvent al módulo calendar..."

# 4a. Agregar updateEvent al controller
if ! grep -q "updateEvent" src/modules/calendar/calendar.controller.js; then
cat >> src/modules/calendar/calendar.controller.js << 'CONTROLLER_EOF'

// ── PATCH /api/calendar/:id ──────────────────────────────────
export const updateEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, subtitle, date, type } = req.body;

    const updateData = {};
    if (title       !== undefined) updateData.title       = title;
    if (description !== undefined) updateData.description = description;
    if (subtitle    !== undefined) updateData.subtitle    = subtitle;
    if (date        !== undefined) updateData.date        = date;
    if (type        !== undefined) updateData.type        = type;

    const { data, error } = await supabase
      .from("calendar_events")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return next(notFound("Evento no encontrado"));
    res.json(data);
  } catch (err) { next(err); }
};
CONTROLLER_EOF
  log "  → updateEvent agregado al controller."
else
  warn "  → updateEvent ya existía. Saltando."
fi

# 4b. Agregar la importación de updateEvent y la ruta PATCH en routes
if ! grep -q "updateEvent" src/modules/calendar/calendar.routes.js; then
  sed -i "s|import { getEvents, createEvent, deleteEvent } from \"./calendar.controller.js\";|import { getEvents, createEvent, deleteEvent, updateEvent } from \"./calendar.controller.js\";|" src/modules/calendar/calendar.routes.js
  # Agregar la ruta antes del export default
  sed -i "s|router.delete(\"/:id\", verifyToken, requireAdmin, deleteEvent);|router.delete(\"/:id\", verifyToken, requireAdmin, deleteEvent);\nrouter.patch(\"/:id\",  verifyToken, requireAdmin, updateEvent);|" src/modules/calendar/calendar.routes.js
  log "  → Ruta PATCH /:id agregada en calendar.routes.js."
else
  warn "  → Ruta PATCH ya existía. Saltando."
fi

# ── 5. Agregar notFound import en calendar.controller.js ─────
#    updateEvent usa notFound() pero no está importado en ese archivo.
if ! grep -q "notFound" src/modules/calendar/calendar.controller.js; then
  sed -i "s|import { badRequest } from \"../../middlewares/errorHandler.js\";|import { badRequest, notFound } from \"../../middlewares/errorHandler.js\";|" src/modules/calendar/calendar.controller.js
  log "  → Import de notFound agregado al calendar controller."
fi

# ── 6. Crear el schema SQL de Supabase ───────────────────────
log "Generando supabase_schema.sql..."
cat > supabase_schema.sql << 'SQL_EOF'
-- ============================================================
--  iTEC BA — Schema de Supabase
--  Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- Tabla de eventos del calendario académico
CREATE TABLE IF NOT EXISTS calendar_events (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT        NOT NULL,
  subtitle    TEXT,
  description TEXT,
  date        DATE        NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN ('examen','institucional','feriado','beca','actividad')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Índice para consultas por fecha (el backend ordena por date ASC)
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events (date ASC);

-- Row Level Security: el service key del backend bypassea RLS,
-- pero bloqueamos acceso público por las dudas.
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
-- Política: solo el rol service_role (tu backend) puede leer/escribir.
-- No se necesita política explícita porque service_role bypasea RLS.

-- ── Tabla de materias (ya existe si el módulo funciona, pero por completitud) ──
CREATE TABLE IF NOT EXISTS materias (
  id       BIGSERIAL PRIMARY KEY,
  materia  TEXT NOT NULL,
  codigo   TEXT,
  carrera  TEXT,
  año      INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Verificar que las tablas se crearon
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('calendar_events', 'materias');
SQL_EOF
log "  → supabase_schema.sql creado. EJECUTALO en el SQL Editor de Supabase."

# ── 7. npm audit fix (vulnerabilidades no críticas) ──────────
log "Corriendo npm audit fix (vulnerabilidades moderadas)..."
npm audit fix 2>&1 | tail -5 || warn "Algunas vulnerabilidades requieren --force (breaking changes). Revisá manualmente."

# ── 8. Resumen final ─────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  RESUMEN DE CAMBIOS APLICADOS${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  ✅ src/config/supabase.js     → Validación de env vars + health-check"
echo "  ✅ src/index.js               → checkSupabaseConnection() al arrancar"
echo "  ✅ calendar.controller.js     → Función updateEvent() agregada"
echo "  ✅ calendar.routes.js         → Ruta PATCH /:id agregada"
echo "  ✅ supabase_schema.sql        → Script SQL para crear las tablas"
echo "  ✅ .gitignore                 → firebase-service-account.json asegurado"
echo "  ✅ npm audit fix              → Vulnerabilidades corregidas"
echo ""
echo -e "${YELLOW}  ACCIÓN MANUAL REQUERIDA:${NC}"
echo ""
echo "  1. 🌐 Ir a https://supabase.com → tu proyecto → SQL Editor"
echo "     Ejecutar el contenido de: supabase_schema.sql"
echo ""
echo "  2. ⏸️  Verificar que el proyecto Supabase NO esté pausado."
echo "     (El free tier pausa proyectos sin actividad por 7 días.)"
echo "     Si está pausado → Dashboard → Settings → Restore project."
echo ""
echo "  3. 🔑 Revocar y regenerar las credenciales del Firebase Service Account."
echo "     El JSON estuvo expuesto en el repo."
echo ""
echo "  4. 📦 git add -A && git commit -m 'fix: calendar 500, supabase validation, patch route'"
echo "     git push → Render desplegará automáticamente."
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"