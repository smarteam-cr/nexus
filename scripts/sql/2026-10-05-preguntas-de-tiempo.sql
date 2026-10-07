-- 2026-10-05 · Tiempos: «¿cuánto te tomó?» justo cuando se termina algo.
--
-- Por qué: hay 1.441 tareas en 50 cronogramas activos y ninguna tiene horas. La carga de Customer
-- Success se arma con un supuesto por tipo de fase (Configuración 2 h, Planificación 1,5 h…). Para
-- reemplazarlo por lo que de verdad toma, se le pregunta a quien termina algo, en el momento:
--   · al marcar una tarea del cronograma como hecha (también al aplicar el avance de la IA, en lote);
--   · al publicar por primera vez un diagnóstico, una planificación, un kickoff o una entrega.
-- Las respuestas calibran las horas POR TIPO DE FASE. No se muestran por persona ni sirven para
-- evaluar a nadie. Lo configura dirección en Feedback › Tiempos. Dos tablas:
--
--   · "EncuestaDeTiempo"  — una por momento: si está activa y su configuración (a quién, en qué
--     tareas, las opciones, cada cuánto). Sin fila, el momento está apagado con la configuración
--     por defecto: la primera vez que dirección la guarda, nace la fila.
--   · "PreguntaDeTiempo"  — cada pregunta hecha: a quién, de qué tarea o documento, la respuesta en
--     minutos (o «omitida» con su motivo) y cuándo pasó.
--
-- ⚠ Momentos, estados y motivos van como TEXT y no como enum (misma decisión que el feedback): sumar
-- uno no debe exigir un ALTER TYPE. Los valores los fija `lib/tiempos/reglas.ts` y los valida la API.
--
-- ADITIVO: 2 tablas nuevas. Nada se dropea, nada se renombra, ninguna tabla existente cambia.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, Feedback › Tiempos dice que falta este archivo y no
-- se pregunta nada; marcar tareas y publicar siguen igual.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-05-preguntas-de-tiempo.sql
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`: droppearía columnas (regla dual-PC, schema.prisma).

CREATE TABLE IF NOT EXISTS "EncuestaDeTiempo" (
  "id"                  TEXT NOT NULL,
  "momento"             TEXT NOT NULL,
  "activa"              BOOLEAN NOT NULL DEFAULT false,
  "config"              JSONB NOT NULL,
  "actualizadaPorEmail" TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EncuestaDeTiempo_pkey" PRIMARY KEY ("id")
);

-- Una encuesta por momento.
CREATE UNIQUE INDEX IF NOT EXISTS "EncuestaDeTiempo_momento_key"
  ON "EncuestaDeTiempo" ("momento");

CREATE TABLE IF NOT EXISTS "PreguntaDeTiempo" (
  "id"              TEXT NOT NULL,
  "encuestaId"      TEXT NOT NULL,
  "clave"           TEXT NOT NULL,
  "personaEmail"    TEXT NOT NULL,
  "rol"             TEXT,
  "estado"          TEXT NOT NULL DEFAULT 'pendiente',
  "motivoOmision"   TEXT,
  "minutos"         INTEGER,
  "estimadoMinutos" INTEGER,
  "projectId"       TEXT,
  "clientId"        TEXT,
  "taskId"          TEXT,
  "documento"       TEXT,
  "tipoFase"        TEXT,
  "party"           TEXT,
  "titulo"          TEXT NOT NULL,
  "origen"          TEXT NOT NULL,
  "lote"            TEXT,
  "ocurrioAt"       TIMESTAMP(3) NOT NULL,
  "venceAt"         TIMESTAMP(3) NOT NULL,
  "respondidaAt"    TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PreguntaDeTiempo_pkey" PRIMARY KEY ("id"),
  -- Una respuesta es un tiempo de trabajo: entre un minuto y un mes de jornadas.
  CONSTRAINT "PreguntaDeTiempo_minutos_rango" CHECK ("minutos" IS NULL OR ("minutos" >= 1 AND "minutos" <= 14400))
);

-- Una sola pregunta por tarea o por documento: marcar dos veces no vuelve a preguntar.
CREATE UNIQUE INDEX IF NOT EXISTS "PreguntaDeTiempo_encuestaId_clave_key"
  ON "PreguntaDeTiempo" ("encuestaId", "clave");

-- «Lo que tengo sin anotar», en «Para ti».
CREATE INDEX IF NOT EXISTS "PreguntaDeTiempo_personaEmail_estado_idx"
  ON "PreguntaDeTiempo" ("personaEmail", "estado");

-- Los resultados, por período.
CREATE INDEX IF NOT EXISTS "PreguntaDeTiempo_encuestaId_ocurrioAt_idx"
  ON "PreguntaDeTiempo" ("encuestaId", "ocurrioAt");

-- Retirar la pregunta cuando la tarea se desmarca.
CREATE INDEX IF NOT EXISTS "PreguntaDeTiempo_taskId_idx"
  ON "PreguntaDeTiempo" ("taskId");

-- CASCADE: una pregunta no existe sin su encuesta (las encuestas no se borran desde la app).
DO $$ BEGIN
  ALTER TABLE "PreguntaDeTiempo" ADD CONSTRAINT "PreguntaDeTiempo_encuestaId_fkey"
    FOREIGN KEY ("encuestaId") REFERENCES "EncuestaDeTiempo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SET NULL: la respuesta sobrevive a que se borre el proyecto, el cliente o la tarea (el título queda congelado).
DO $$ BEGIN
  ALTER TABLE "PreguntaDeTiempo" ADD CONSTRAINT "PreguntaDeTiempo_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PreguntaDeTiempo" ADD CONSTRAINT "PreguntaDeTiempo_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PreguntaDeTiempo" ADD CONSTRAINT "PreguntaDeTiempo_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "TimelineTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`: sin esto, cuánto
-- tarda cada persona en cada tarea sería leíble con la clave pública que viaja en el navegador. RLS
-- sin policy SELECT = cerrado para `anon` y `authenticated`; la RESTRICTIVE de encima lo mantiene
-- cerrado aunque alguien sume mañana una policy permisiva. `postgres` (Prisma) tiene BYPASSRLS.
ALTER TABLE "EncuestaDeTiempo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PreguntaDeTiempo" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "EncuestaDeTiempo";
CREATE POLICY deny_all_non_superuser ON "EncuestaDeTiempo" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "PreguntaDeTiempo";
CREATE POLICY deny_all_non_superuser ON "PreguntaDeTiempo" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado recién aplicado: las dos con rowsecurity = true.
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('EncuestaDeTiempo', 'PreguntaDeTiempo');
