-- 2026-10-26 · El analizador de reuniones de venta, S1 a S3 (docs/analizador-reuniones-venta-plan.md).
--
-- Por qué:
--   · "AnalisisDeVenta" (S3) — el análisis de UNA reunión de venta: qué tan consultiva fue, de qué se habló, la guía, la
--     escala, el posicionamiento, qué quedó sin explorar, en qué posición quedó el vendedor, el siguiente paso y las
--     recomendaciones, cada juicio con su cita de la transcripción. Es una PROPUESTA (coaching, no evaluación): S4 suma
--     los comentarios del vendedor y la confirmación. Guarda también quién habló (S2, calculado) y con qué versión del
--     criterio se hizo. Una fila por reunión (volver a analizar la reemplaza). `clientId` es la empresa dueña de la
--     reunión cuando se analizó: INV57 vigila que siga siéndolo.
--   · "ReunionDeReferenciaDeVenta" (S1) — una reunión marcada a mano como ejemplo de lo que sí es consultivo (hoy la de
--     Camosa, hasta que llegue la de Grupo Avis por T5).
--     ⚠ Se quitó el 2026-10-27 (Elías): referencia-server.ts se borró y la tabla quedó sin escritores ni lectores.
-- Las escribe SOLO lib/analizador-venta/ (analizar-server.ts; referencia-server.ts hasta el 2026-10-27). Se borran en cascada con su
-- reunión; el análisis, también con su empresa (y la fusión de dos fichas lo muda: lib/clients/fusion-de-empresas.ts).
--
-- ADITIVO: 1 tipo y 2 tablas nuevas. Nada se dropea, nada se renombra. Inocuo con el código viejo corriendo. Se puede
-- correr dos veces.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 y el deploy se revierte solo.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-26-analizador-venta.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⛔ NUNCA `prisma db push`.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoDelAnalisisDeVenta') THEN
    CREATE TYPE "EstadoDelAnalisisDeVenta" AS ENUM ('PROPUESTO', 'ERROR');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AnalisisDeVenta" (
  "id"           TEXT NOT NULL,
  "sessionId"    TEXT NOT NULL,
  "clientId"     TEXT NOT NULL,
  "estado"       "EstadoDelAnalisisDeVenta" NOT NULL DEFAULT 'PROPUESTO',
  "resultado"    JSONB,
  "quienHablo"   JSONB,
  "criterio"     TEXT NOT NULL,
  "descartados"  INTEGER NOT NULL DEFAULT 0,
  "error"        TEXT,
  "agentRunId"   TEXT,
  "pedidoPor"    TEXT,
  "analizadoAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalisisDeVenta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AnalisisDeVenta_sessionId_key" ON "AnalisisDeVenta" ("sessionId");
CREATE INDEX IF NOT EXISTS "AnalisisDeVenta_clientId_idx" ON "AnalisisDeVenta" ("clientId");

DO $$ BEGIN
  ALTER TABLE "AnalisisDeVenta" ADD CONSTRAINT "AnalisisDeVenta_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "AnalisisDeVenta" ADD CONSTRAINT "AnalisisDeVenta_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ReunionDeReferenciaDeVenta" (
  "id"          TEXT NOT NULL,
  "sessionId"   TEXT NOT NULL,
  "marcadaPor"  TEXT NOT NULL,
  "nota"        TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReunionDeReferenciaDeVenta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReunionDeReferenciaDeVenta_sessionId_key" ON "ReunionDeReferenciaDeVenta" ("sessionId");

DO $$ BEGIN
  ALTER TABLE "ReunionDeReferenciaDeVenta" ADD CONSTRAINT "ReunionDeReferenciaDeVenta_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — citas de conversaciones con clientes y juicios sobre el equipo: cerrado para `anon` y `authenticated`.
ALTER TABLE "AnalisisDeVenta" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "AnalisisDeVenta";
CREATE POLICY deny_all_non_superuser ON "AnalisisDeVenta" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

ALTER TABLE "ReunionDeReferenciaDeVenta" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "ReunionDeReferenciaDeVenta";
CREATE POLICY deny_all_non_superuser ON "ReunionDeReferenciaDeVenta" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('AnalisisDeVenta', 'ReunionDeReferenciaDeVenta');
