-- 2026-11-19 · Trivias: juegos de preguntas en vivo (tipo Kahoot) para el coaching del equipo.
--
-- POR QUÉ. Elías pidió un módulo para armar trivias, lanzarlas en vivo (código, enlace y QR), que el equipo juegue
-- desde el teléfono con su usuario de Nexus y que cada partida quede guardada con lo que respondió cada uno.
-- Decisión completa: docs/DECISIONS.md › «Trivias».
--
-- QUÉ ENTRA (ADITIVO; se puede correr dos veces):
--   1. Tres tipos: "TipoDePreguntaDeTrivia", "ModoDePuntosDeTrivia" y "EstadoDePartidaDeTrivia".
--   2. Cinco tablas: "Trivia", "PreguntaDeTrivia", "PartidaDeTrivia", "JugadorDeTrivia" y "RespuestaDeTrivia", con sus
--      índices y llaves (los nombres son los que pone Prisma: `migrate diff` no muestra deriva).
--   3. RLS y deny-all RESTRICTIVE en las cinco: solo las lee el servidor.
--
-- ⚠ ORDEN: ANTES del deploy. Sin las tablas, /api/health responde 503 (el cliente Prisma las conoce) y el deploy se
-- revierte solo. El código viejo no las conoce.
--
-- Volver atrás (borra las trivias y sus partidas):
--   DROP TABLE IF EXISTS "RespuestaDeTrivia", "JugadorDeTrivia", "PartidaDeTrivia", "PreguntaDeTrivia", "Trivia";
--   DROP TYPE IF EXISTS "EstadoDePartidaDeTrivia", "ModoDePuntosDeTrivia", "TipoDePreguntaDeTrivia";
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-11-19-trivias.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate + reiniciar el dev server · npm run check:esquema.
-- ⛔ NUNCA `prisma db push`.

-- ── Tipos ───────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoDePreguntaDeTrivia') THEN
    CREATE TYPE "TipoDePreguntaDeTrivia" AS ENUM ('OPCION_MULTIPLE', 'VERDADERO_FALSO', 'ENCUESTA');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ModoDePuntosDeTrivia') THEN
    CREATE TYPE "ModoDePuntosDeTrivia" AS ENUM ('PRECISION', 'VELOCIDAD');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoDePartidaDeTrivia') THEN
    CREATE TYPE "EstadoDePartidaDeTrivia" AS ENUM ('ESPERA', 'PREGUNTA', 'POSICIONES', 'FINALIZADA');
  END IF;
END $$;

-- ── Tablas ──────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Trivia" (
  "id"          TEXT NOT NULL,
  "titulo"      TEXT NOT NULL,
  "creadaPorId" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Trivia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PreguntaDeTrivia" (
  "id"        TEXT NOT NULL,
  "triviaId"  TEXT NOT NULL,
  "orden"     INTEGER NOT NULL,
  "tipo"      "TipoDePreguntaDeTrivia" NOT NULL,
  "texto"     TEXT NOT NULL,
  "opciones"  TEXT[],
  "correctas" INTEGER[],
  "segundos"  INTEGER NOT NULL DEFAULT 20,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreguntaDeTrivia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PartidaDeTrivia" (
  "id"                TEXT NOT NULL,
  "codigo"            TEXT NOT NULL,
  "triviaId"          TEXT,
  "anfitrionId"       TEXT NOT NULL,
  "titulo"            TEXT NOT NULL,
  "preguntas"         JSONB NOT NULL,
  "modo"              "ModoDePuntosDeTrivia" NOT NULL,
  "estado"            "EstadoDePartidaDeTrivia" NOT NULL DEFAULT 'ESPERA',
  "preguntaActual"    INTEGER NOT NULL DEFAULT 0,
  "preguntaAbiertaAt" TIMESTAMP(3),
  "preguntaCierraAt"  TIMESTAMP(3),
  "terminadaAt"       TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartidaDeTrivia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "JugadorDeTrivia" (
  "id"           TEXT NOT NULL,
  "partidaId"    TEXT NOT NULL,
  "teamMemberId" TEXT NOT NULL,
  "nombre"       TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JugadorDeTrivia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "RespuestaDeTrivia" (
  "id"         TEXT NOT NULL,
  "partidaId"  TEXT NOT NULL,
  "jugadorId"  TEXT NOT NULL,
  "pregunta"   INTEGER NOT NULL,
  "opcion"     INTEGER NOT NULL,
  "esCorrecta" BOOLEAN,
  "puntos"     INTEGER NOT NULL,
  "tardoMs"    INTEGER NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RespuestaDeTrivia_pkey" PRIMARY KEY ("id")
);

-- ── Índices (los únicos sostienen las reglas: una respuesta por jugador y pregunta, un jugador por persona) ────────
CREATE INDEX IF NOT EXISTS "Trivia_creadaPorId_updatedAt_idx" ON "Trivia" ("creadaPorId", "updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PreguntaDeTrivia_triviaId_orden_key" ON "PreguntaDeTrivia" ("triviaId", "orden");
CREATE UNIQUE INDEX IF NOT EXISTS "PartidaDeTrivia_codigo_key" ON "PartidaDeTrivia" ("codigo");
CREATE INDEX IF NOT EXISTS "PartidaDeTrivia_anfitrionId_createdAt_idx" ON "PartidaDeTrivia" ("anfitrionId", "createdAt");
CREATE INDEX IF NOT EXISTS "PartidaDeTrivia_triviaId_idx" ON "PartidaDeTrivia" ("triviaId");
CREATE INDEX IF NOT EXISTS "JugadorDeTrivia_teamMemberId_idx" ON "JugadorDeTrivia" ("teamMemberId");
CREATE UNIQUE INDEX IF NOT EXISTS "JugadorDeTrivia_partidaId_teamMemberId_key" ON "JugadorDeTrivia" ("partidaId", "teamMemberId");
CREATE INDEX IF NOT EXISTS "RespuestaDeTrivia_partidaId_pregunta_idx" ON "RespuestaDeTrivia" ("partidaId", "pregunta");
CREATE UNIQUE INDEX IF NOT EXISTS "RespuestaDeTrivia_jugadorId_pregunta_key" ON "RespuestaDeTrivia" ("jugadorId", "pregunta");

-- ── Llaves ──────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "Trivia" ADD CONSTRAINT "Trivia_creadaPorId_fkey"
    FOREIGN KEY ("creadaPorId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PreguntaDeTrivia" ADD CONSTRAINT "PreguntaDeTrivia_triviaId_fkey"
    FOREIGN KEY ("triviaId") REFERENCES "Trivia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PartidaDeTrivia" ADD CONSTRAINT "PartidaDeTrivia_triviaId_fkey"
    FOREIGN KEY ("triviaId") REFERENCES "Trivia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PartidaDeTrivia" ADD CONSTRAINT "PartidaDeTrivia_anfitrionId_fkey"
    FOREIGN KEY ("anfitrionId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "JugadorDeTrivia" ADD CONSTRAINT "JugadorDeTrivia_partidaId_fkey"
    FOREIGN KEY ("partidaId") REFERENCES "PartidaDeTrivia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "JugadorDeTrivia" ADD CONSTRAINT "JugadorDeTrivia_teamMemberId_fkey"
    FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "RespuestaDeTrivia" ADD CONSTRAINT "RespuestaDeTrivia_partidaId_fkey"
    FOREIGN KEY ("partidaId") REFERENCES "PartidaDeTrivia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "RespuestaDeTrivia" ADD CONSTRAINT "RespuestaDeTrivia_jugadorId_fkey"
    FOREIGN KEY ("jugadorId") REFERENCES "JugadorDeTrivia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ── ⚠ OBLIGATORIO: ningún DDL lo enciende solo (ARCHITECTURE §4.5).
ALTER TABLE "Trivia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PreguntaDeTrivia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartidaDeTrivia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JugadorDeTrivia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RespuestaDeTrivia" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "Trivia";
CREATE POLICY deny_all_non_superuser ON "Trivia" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "PreguntaDeTrivia";
CREATE POLICY deny_all_non_superuser ON "PreguntaDeTrivia" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "PartidaDeTrivia";
CREATE POLICY deny_all_non_superuser ON "PartidaDeTrivia" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "JugadorDeTrivia";
CREATE POLICY deny_all_non_superuser ON "JugadorDeTrivia" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "RespuestaDeTrivia";
CREATE POLICY deny_all_non_superuser ON "RespuestaDeTrivia" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- Verificación (solo lectura):
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE tablename IN ('Trivia','PreguntaDeTrivia','PartidaDeTrivia','JugadorDeTrivia','RespuestaDeTrivia');
