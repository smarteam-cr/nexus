-- 2026-10-25 · U1 de la integración con Google (docs/integracion-google-plan.md): el código de la reunión, los
-- eventos cancelados y los participantes de cada reunión.
--
-- Por qué:
--   · "conferenceId" — el código de Meet de la reunión (abc-defg-hij). Lo trae el evento del calendario y hasta hoy se
--     tiraba. U3 lo necesita para cruzar la reunión con su registro de conferencia (la API de Meet). Con índice: U3
--     busca por él.
--   · "canceladaEn" — cuándo vio la copia de Calendar que el evento se canceló. Un evento cancelado NUNCA se borra
--     (borrar la fila arrastra en cascada los hechos, los turnos y la lectura): se marca. La cancelada con texto,
--     minuta, hechos o tareas queda para que una persona la revise; la que no tiene nada sale del chokepoint, del
--     buscador y de la cola (lib/sessions/canceladas.ts). Si el evento vuelve, la copia lo desmarca.
--   · "ParticipanteDeReunion" — cada invitado de la reunión con su respuesta al evento (aceptó, tentativa, rechazó,
--     sin responder) y si es del equipo. "entro", "salio" y "minutos" nacen vacíos: los llena U3 con la asistencia
--     real de la API de Meet (y T7 la lee). U3 y T7 la llenan y no crean otra tabla. ⚠ Google pide no usar la
--     asistencia para medir desempeño: los minutos de cada persona no van a ninguna evaluación.
-- La escribe SOLO la copia de Calendar (lib/google/meet-sync.ts). Se borra en cascada con su reunión.
--
-- ADITIVO: 2 columnas nullable, 1 índice, 1 tipo y 1 tabla nuevos. Nada se dropea, nada se renombra. Inocuo con el
-- código viejo corriendo: no lee ni escribe nada de esto. Se puede correr dos veces.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce las
-- columnas) y el deploy se revierte solo.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-25-reuniones-codigo-y-participantes.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⛔ NUNCA `prisma db push`.

ALTER TABLE "FirefliesSession" ADD COLUMN IF NOT EXISTS "conferenceId" TEXT;
ALTER TABLE "FirefliesSession" ADD COLUMN IF NOT EXISTS "canceladaEn" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "FirefliesSession_conferenceId_idx" ON "FirefliesSession" ("conferenceId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RespuestaAlEvento') THEN
    CREATE TYPE "RespuestaAlEvento" AS ENUM ('ACEPTO', 'TENTATIVA', 'RECHAZO', 'SIN_RESPONDER');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ParticipanteDeReunion" (
  "id"          TEXT NOT NULL,
  "sessionId"   TEXT NOT NULL,
  "correo"      TEXT NOT NULL,
  "esDelEquipo" BOOLEAN NOT NULL DEFAULT false,
  "respuesta"   "RespuestaAlEvento",
  "entro"       TIMESTAMP(3),
  "salio"       TIMESTAMP(3),
  "minutos"     INTEGER,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ParticipanteDeReunion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ParticipanteDeReunion_sessionId_correo_key"
  ON "ParticipanteDeReunion" ("sessionId", "correo");

CREATE INDEX IF NOT EXISTS "ParticipanteDeReunion_correo_idx"
  ON "ParticipanteDeReunion" ("correo");

DO $$ BEGIN
  ALTER TABLE "ParticipanteDeReunion" ADD CONSTRAINT "ParticipanteDeReunion_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — correos de clientes y del equipo: cerrado para `anon` y `authenticated`. La RESTRICTIVE lo mantiene
-- cerrado aunque alguien sume mañana una policy permisiva.
ALTER TABLE "ParticipanteDeReunion" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "ParticipanteDeReunion";
CREATE POLICY deny_all_non_superuser ON "ParticipanteDeReunion" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'FirefliesSession' AND column_name IN ('conferenceId', 'canceladaEn');
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'ParticipanteDeReunion';
