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
