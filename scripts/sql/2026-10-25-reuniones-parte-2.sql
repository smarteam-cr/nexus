-- 2026-10-25 · Las reuniones, la pieza angular del contexto, parte 2 (docs/reuniones-pieza-angular-plan.md, T3 a T5).
--
-- Por qué:
--   · "motivoSinTexto" y "motivoSinTextoAt" (T4) — POR QUÉ una reunión no dejó texto, guardado. Lo calcula
--     lib/google/por-que-falta.ts (puro) y lo escribe SOLO el job `reuniones-motivos`
--     (lib/sessions/motivo-sin-texto-server.ts). Se borra cuando la reunión tiene texto. Es TEXT y no un enum a
--     propósito: la lista de motivos vive en el código y crece (el «no ocurrió» de U3), y agregarle un valor a un enum
--     de Postgres pide el camino aparte de `ALTER TYPE ... ADD VALUE`.
--   · "PropuestaDeEmpresa" (T3) — a qué empresa propone Nexus una reunión con texto que no tiene dueña. La saca el
--     resolver único (lib/sessions/categorize.ts, sin matching nuevo) y la escribe el job `reuniones-propuestas`: o un
--     cliente que ya está, o una empresa de HubSpot del dominio que todavía no está en Nexus (se crea como prospecto al
--     confirmar). Quien la decide queda anotado: así se mide «2 de cada 3 propuestas confirmadas en 48 horas».
--   · "AudioDeReunion" (T5) — el audio de una reunión presencial, subido a Google Cloud Storage y transcrito con
--     Speech-to-Text de Google. Una fila por reunión. Detrás de REUNIONES_AUDIO=1 (apagada).
--
-- ADITIVO: 2 columnas nullable, 3 tipos y 2 tablas nuevas. Nada se dropea, nada se renombra. Inocuo con el código viejo
-- corriendo: no lee ni escribe nada de esto. Se puede correr dos veces.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce las columnas)
-- y el deploy se revierte solo.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-25-reuniones-parte-2.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⛔ NUNCA `prisma db push`.

-- ── T4 · el motivo de cada reunión sin texto ─────────────────────────────────────────
ALTER TABLE "FirefliesSession" ADD COLUMN IF NOT EXISTS "motivoSinTexto" TEXT;
ALTER TABLE "FirefliesSession" ADD COLUMN IF NOT EXISTS "motivoSinTextoAt" TIMESTAMP(3);

-- ── T3 · la empresa que propone Nexus ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoDePropuestaDeEmpresa') THEN
    CREATE TYPE "TipoDePropuestaDeEmpresa" AS ENUM ('CLIENTE', 'HUBSPOT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DecisionDeLaPropuesta') THEN
    CREATE TYPE "DecisionDeLaPropuesta" AS ENUM ('CONFIRMADA', 'OTRA');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoDelAudio') THEN
    CREATE TYPE "EstadoDelAudio" AS ENUM ('SUBIENDO', 'TRANSCRIBIENDO', 'LISTO', 'ERROR');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PropuestaDeEmpresa" (
  "id"               TEXT NOT NULL,
  "sessionId"        TEXT NOT NULL,
  "tipo"             "TipoDePropuestaDeEmpresa" NOT NULL,
  "clientId"         TEXT,
  "hubspotCompanyId" TEXT,
  "nombre"           TEXT NOT NULL,
  "dominio"          TEXT,
  "propuestaAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decision"         "DecisionDeLaPropuesta",
  "decididaAt"       TIMESTAMP(3),
  "decididaPor"      TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PropuestaDeEmpresa_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PropuestaDeEmpresa_sessionId_key" ON "PropuestaDeEmpresa" ("sessionId");
CREATE INDEX IF NOT EXISTS "PropuestaDeEmpresa_decision_idx" ON "PropuestaDeEmpresa" ("decision");

DO $$ BEGIN
  ALTER TABLE "PropuestaDeEmpresa" ADD CONSTRAINT "PropuestaDeEmpresa_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PropuestaDeEmpresa" ADD CONSTRAINT "PropuestaDeEmpresa_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── T5 · el audio de la reunión presencial ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AudioDeReunion" (
  "id"           TEXT NOT NULL,
  "sessionId"    TEXT NOT NULL,
  "objeto"       TEXT NOT NULL,
  "archivo"      TEXT NOT NULL,
  "tipo"         TEXT NOT NULL,
  "bytes"        INTEGER NOT NULL,
  "estado"       "EstadoDelAudio" NOT NULL DEFAULT 'SUBIENDO',
  "operacion"    TEXT,
  "error"        TEXT,
  "minutos"      DOUBLE PRECISION,
  "subidoPor"    TEXT NOT NULL,
  "terminadoAt"  TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AudioDeReunion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AudioDeReunion_sessionId_key" ON "AudioDeReunion" ("sessionId");
CREATE INDEX IF NOT EXISTS "AudioDeReunion_estado_idx" ON "AudioDeReunion" ("estado");

DO $$ BEGIN
  ALTER TABLE "AudioDeReunion" ADD CONSTRAINT "AudioDeReunion_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — nombres de empresas, dominios de clientes y la ruta del audio: cerrado para `anon` y `authenticated`.
-- La RESTRICTIVE lo mantiene cerrado aunque alguien sume mañana una policy permisiva.
ALTER TABLE "PropuestaDeEmpresa" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "PropuestaDeEmpresa";
CREATE POLICY deny_all_non_superuser ON "PropuestaDeEmpresa" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

ALTER TABLE "AudioDeReunion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "AudioDeReunion";
CREATE POLICY deny_all_non_superuser ON "AudioDeReunion" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'FirefliesSession' AND column_name IN ('motivoSinTexto', 'motivoSinTextoAt');
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('PropuestaDeEmpresa', 'AudioDeReunion');
