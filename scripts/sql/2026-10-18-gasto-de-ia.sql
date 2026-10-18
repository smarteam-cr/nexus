-- 2026-10-18 · El gasto de la IA (iniciativa 6 de «La siguiente serie»; DECISIONS «El gasto de la IA, por mes»).
--
-- LlmCall.lote: la llamada la respondió la API Batch y costó la mitad (lib/ai/medidor.ts solo la escribe en true).
-- PedidoEnLote: los pedidos a Claude que no apuran y van por la API Batch (lib/ai/lotes-server.ts, job «ia-lotes»).
-- FacturaDeAnthropic: lo que facturó Anthropic cada mes, anotado a mano, para compararlo con lo medido.
--
-- ADITIVO: 1 columna con default y 2 tablas nuevas con RLS y una política RESTRICTIVE que niega todo a
-- anon/authenticated (solo las lee Prisma). Interno: gasto de IA, solo dirección.
--
-- ⛔ ORDEN: esto va ANTES del deploy. /api/health responde 503 sin estas tablas y deploy.sh revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-18-gasto-de-ia.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`. Se puede correr dos veces.

ALTER TABLE "LlmCall" ADD COLUMN IF NOT EXISTS "lote" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "PedidoEnLote" (
  "id"          TEXT PRIMARY KEY,
  "tipo"        TEXT NOT NULL,
  "claveUnica"  TEXT NOT NULL,
  "pedido"      JSONB NOT NULL,
  "contexto"    JSONB NOT NULL,
  "estado"      TEXT NOT NULL DEFAULT 'en_espera',
  "loteId"      TEXT,
  "enviadoAt"   TIMESTAMP(3),
  "terminadoAt" TIMESTAMP(3),
  "error"       TEXT,
  "agentSlug"   TEXT,
  "clientId"    TEXT,
  "projectId"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "PedidoEnLote_claveUnica_key" ON "PedidoEnLote"("claveUnica");
CREATE INDEX IF NOT EXISTS "PedidoEnLote_estado_createdAt_idx" ON "PedidoEnLote"("estado", "createdAt");
CREATE INDEX IF NOT EXISTS "PedidoEnLote_loteId_idx" ON "PedidoEnLote"("loteId");

CREATE TABLE IF NOT EXISTS "FacturaDeAnthropic" (
  "id"              TEXT PRIMARY KEY,
  "mes"             TEXT NOT NULL,
  "montoUsd"        DECIMAL(12,2) NOT NULL,
  "notas"           TEXT,
  "anotadaPorEmail" TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "FacturaDeAnthropic_mes_key" ON "FacturaDeAnthropic"("mes");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PedidoEnLote_estado_check') THEN
    ALTER TABLE "PedidoEnLote" ADD CONSTRAINT "PedidoEnLote_estado_check"
      CHECK ("estado" IN ('en_espera', 'enviado', 'listo', 'error', 'vencido'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FacturaDeAnthropic_mes_check') THEN
    ALTER TABLE "FacturaDeAnthropic" ADD CONSTRAINT "FacturaDeAnthropic_mes_check" CHECK ("mes" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FacturaDeAnthropic_monto_check') THEN
    ALTER TABLE "FacturaDeAnthropic" ADD CONSTRAINT "FacturaDeAnthropic_monto_check" CHECK ("montoUsd" >= 0);
  END IF;
END $$;

ALTER TABLE "PedidoEnLote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FacturaDeAnthropic" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'PedidoEnLote' AND policyname = 'deny_all_non_superuser') THEN
    CREATE POLICY "deny_all_non_superuser" ON "PedidoEnLote" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'FacturaDeAnthropic' AND policyname = 'deny_all_non_superuser') THEN
    CREATE POLICY "deny_all_non_superuser" ON "FacturaDeAnthropic" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
END $$;
