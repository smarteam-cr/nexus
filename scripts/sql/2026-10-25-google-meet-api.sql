-- 2026-10-25 · U3 de la integración con Google (docs/integracion-google-plan.md): lo que dice la API de Meet de cada
-- reunión: si ocurrió, a qué hora de verdad, quiénes entraron y la transcripción por frases.
--
-- Por qué:
--   · "estadoDeConferencia" — OCURRIO, NO_OCURRIO o SIN_ACCESO (la organizó alguien de fuera y nadie del equipo
--     entró: Meet no nos dice nada). Hasta hoy «no ocurrió» contaba como «no se grabó». null = todavía no se miró.
--   · "conferenciaInicio" / "conferenciaFin" — la hora REAL de la conferencia. No pisa "date", que es la del evento del
--     calendario y la copia de Calendar reescribe cada 10 minutos («Cemaco | Data Hub»: evento a las 3 de la tarde,
--     conferencia de 8:58 a 9:46).
--   · "conferenciaRevisadaEn" / "conferenciaCerradaEn" — cuándo se le preguntó a Meet por última vez, y cuándo ya no
--     quedaba nada que esperar (la transcripción y las notas generadas, o no hubo). INV53 mira que ninguna reunión
--     llegue a los 25 días sin cerrar: las frases se borran a los 30.
--   · "docDeTranscripcionId" / "docDeNotasId" — los Docs que Meet dice que generó para esa conferencia. Con ellos la
--     lectura va al Doc correcto por su id en vez de buscarlo en el Drive por el título (KNOWN-ERRORS, primera entrada).
--   · "ParticipanteDeReunion"."nombre" / "idEnMeet" — el nombre con el que entró y su id en Meet. Quien entró y Meet
--     no da su correo (de otra organización, anónimo o por teléfono) queda con un "correo" que empieza con «meet:».
--   · "FraseDeReunion" — la transcripción por frases, con quién habló y cuándo. Se copia antes de los 30 días (Google la
--     borra). Se borra en cascada con su reunión.
-- Lo escribe SOLO lib/google/conferencias.ts (la revisión de las conferencias, job `google-meet-conferencias`).
--
-- ADITIVO: 1 tipo, 8 columnas nullable, 1 tabla y sus índices. Nada se dropea, nada se renombra. Inocuo con el
-- código viejo corriendo: no lee ni escribe nada de esto. Se puede correr dos veces.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce las
-- columnas) y el deploy se revierte solo.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-25-google-meet-api.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⛔ NUNCA `prisma db push`.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoDeConferencia') THEN
    CREATE TYPE "EstadoDeConferencia" AS ENUM ('OCURRIO', 'NO_OCURRIO', 'SIN_ACCESO');
  END IF;
END $$;

ALTER TABLE "FirefliesSession" ADD COLUMN IF NOT EXISTS "estadoDeConferencia" "EstadoDeConferencia";
ALTER TABLE "FirefliesSession" ADD COLUMN IF NOT EXISTS "conferenciaInicio" TIMESTAMP(3);
ALTER TABLE "FirefliesSession" ADD COLUMN IF NOT EXISTS "conferenciaFin" TIMESTAMP(3);
ALTER TABLE "FirefliesSession" ADD COLUMN IF NOT EXISTS "conferenciaRevisadaEn" TIMESTAMP(3);
ALTER TABLE "FirefliesSession" ADD COLUMN IF NOT EXISTS "conferenciaCerradaEn" TIMESTAMP(3);
ALTER TABLE "FirefliesSession" ADD COLUMN IF NOT EXISTS "docDeTranscripcionId" TEXT;
ALTER TABLE "FirefliesSession" ADD COLUMN IF NOT EXISTS "docDeNotasId" TEXT;

ALTER TABLE "ParticipanteDeReunion" ADD COLUMN IF NOT EXISTS "nombre" TEXT;
ALTER TABLE "ParticipanteDeReunion" ADD COLUMN IF NOT EXISTS "idEnMeet" TEXT;

CREATE TABLE IF NOT EXISTS "FraseDeReunion" (
  "id"        TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "orden"     INTEGER NOT NULL,
  "hablante"  TEXT NOT NULL,
  "correo"    TEXT,
  "inicio"    TIMESTAMP(3) NOT NULL,
  "fin"       TIMESTAMP(3),
  "texto"     TEXT NOT NULL,
  "idioma"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FraseDeReunion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FraseDeReunion_sessionId_orden_key" ON "FraseDeReunion" ("sessionId", "orden");

DO $$ BEGIN
  ALTER TABLE "FraseDeReunion" ADD CONSTRAINT "FraseDeReunion_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — lo que dijo cada persona en reuniones con clientes: cerrado para `anon` y `authenticated`. La
-- RESTRICTIVE lo mantiene cerrado aunque alguien sume mañana una policy permisiva.
ALTER TABLE "FraseDeReunion" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "FraseDeReunion";
CREATE POLICY deny_all_non_superuser ON "FraseDeReunion" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'FirefliesSession' AND column_name LIKE 'conferencia%';
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'FraseDeReunion';
