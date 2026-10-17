-- 2026-10-17 · Ficha G: cada reunión con su página (roadmap «Reuniones y memoria», pasos 5 y 6).
--
-- Dos cosas:
--   1. `FirefliesSession.descripcionDelEvento`: la descripción del evento del calendario, limpia. Es la AGENDA de la
--      reunión (lo que se iba a tratar). La escribe la sync de Meet desde el deploy que trae este SQL.
--   2. `SeguimientoDeReunion`: lo que se hace con una reunión después de que ocurre: la agenda escrita por una persona,
--      el correo de seguimiento (Nexus no envía nada) y la próxima reunión sugerida (se agenda en Google Calendar por
--      enlace: Nexus no escribe en el calendario). Cuelga de la reunión (CASCADE), no del cliente.
--
-- ADITIVO: 1 columna nullable + 1 tabla nueva. Nada se dropea ni se renombra. Se puede correr dos veces.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce la columna y
-- el modelo) y el deploy se revierte solo.
-- ⚠ La primera sync de Meet después del deploy escribe la descripción en las reuniones de la ventana (30 días) que la
-- tengan: una sola vez, un UPDATE por reunión (las de antes no cambian hasta que la sync las vuelva a ver).
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-17-ficha-g-reunion.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`.

ALTER TABLE "FirefliesSession" ADD COLUMN IF NOT EXISTS "descripcionDelEvento" TEXT;

CREATE TABLE IF NOT EXISTS "SeguimientoDeReunion" (
  "id"                 TEXT NOT NULL,
  "sessionId"          TEXT NOT NULL,
  "agenda"             TEXT,
  "agendaPorEmail"     TEXT,
  "agendaEn"           TIMESTAMP(3),
  "correo"             JSONB,
  "proximaTitulo"      TEXT,
  "proximaObjetivo"    TEXT,
  "proximaInicio"      TIMESTAMP(3),
  "proximaDuracionMin" INTEGER,
  "proximaEstado"      TEXT,
  "proximaPorEmail"    TEXT,
  "proximaEn"          TIMESTAMP(3),
  "version"            INTEGER NOT NULL DEFAULT 0,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SeguimientoDeReunion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SeguimientoDeReunion_proximaEstado_valido" CHECK ("proximaEstado" IS NULL OR "proximaEstado" IN ('agendada', 'descartada')),
  CONSTRAINT "SeguimientoDeReunion_duracion_razonable" CHECK ("proximaDuracionMin" IS NULL OR "proximaDuracionMin" BETWEEN 15 AND 480)
);

CREATE UNIQUE INDEX IF NOT EXISTS "SeguimientoDeReunion_sessionId_key"
  ON "SeguimientoDeReunion" ("sessionId");

-- La agenda de una reunión busca la próxima reunión que otra dejó agendada cerca de su hora.
CREATE INDEX IF NOT EXISTS "SeguimientoDeReunion_proximaEstado_proximaInicio_idx"
  ON "SeguimientoDeReunion" ("proximaEstado", "proximaInicio");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SeguimientoDeReunion_sessionId_fkey') THEN
    ALTER TABLE "SeguimientoDeReunion"
      ADD CONSTRAINT "SeguimientoDeReunion_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`: sin esto, el correo de seguimiento
-- y la agenda de las reuniones serían leíbles con la clave pública del navegador. `postgres` (Prisma) tiene BYPASSRLS.
ALTER TABLE "SeguimientoDeReunion" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "SeguimientoDeReunion";
CREATE POLICY deny_all_non_superuser ON "SeguimientoDeReunion" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'SeguimientoDeReunion';
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'FirefliesSession' AND column_name = 'descripcionDelEvento';
