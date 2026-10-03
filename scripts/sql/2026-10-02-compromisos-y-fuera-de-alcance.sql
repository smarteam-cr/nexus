-- 2026-10-02 · Compromisos con fecha y pedidos fuera de alcance que salen en las reuniones.
--
-- Validado con 14 sesiones reales: de 41 hechos, el agente capturaba 4. Los compromisos del CLIENTE
-- («Rodrigo entrega la base el miércoles») y los pedidos fuera de alcance («ese módulo no estaba
-- incluido») no tenían dónde caer. Ahora los detecta el análisis post-sesión (lee el transcript
-- completo) y caen en:
--   · ActionItem, con quién se comprometió (cliente o Smarteam) y la cita;
--   · PedidoFueraDeAlcance, que decide el CSE y Ventas ve como oportunidad.
--
-- ADITIVO: 3 columnas nullable en ActionItem y 1 tabla nueva. El código que corre hoy no se entera.
-- ⛔ ORDEN: esto va ANTES del deploy (sin la tabla, la revisión de salud revierte el deploy).
--
-- Aplicar (En tu PC):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-02-compromisos-y-fuera-de-alcance.sql; Remove-Item Env:ALLOW_PROD_WRITE

BEGIN;

ALTER TABLE "ActionItem" ADD COLUMN IF NOT EXISTS "ladoResponsable" TEXT;
ALTER TABLE "ActionItem" ADD COLUMN IF NOT EXISTS "responsableNombre" TEXT;
ALTER TABLE "ActionItem" ADD COLUMN IF NOT EXISTS "cita" TEXT;

CREATE TABLE IF NOT EXISTS "PedidoFueraDeAlcance" (
  "id"           TEXT NOT NULL,
  "clientId"     TEXT NOT NULL,
  "projectId"    TEXT,
  "sessionId"    TEXT,
  "huella"       TEXT NOT NULL,
  "pedido"       TEXT NOT NULL,
  "quienLoPidio" TEXT,
  "estado"       TEXT NOT NULL DEFAULT 'PEDIDO',
  "monto"        TEXT,
  "cita"         TEXT,
  "decididoPor"  TEXT,
  "decididoAt"   TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PedidoFueraDeAlcance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PedidoFueraDeAlcance_clientId_huella_key" ON "PedidoFueraDeAlcance" ("clientId", "huella");
CREATE INDEX IF NOT EXISTS "PedidoFueraDeAlcance_projectId_estado_idx" ON "PedidoFueraDeAlcance" ("projectId", "estado");
DO $$ BEGIN
  ALTER TABLE "PedidoFueraDeAlcance" ADD CONSTRAINT "PedidoFueraDeAlcance_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PedidoFueraDeAlcance" ADD CONSTRAINT "PedidoFueraDeAlcance_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PedidoFueraDeAlcance" ADD CONSTRAINT "PedidoFueraDeAlcance_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "PedidoFueraDeAlcance" ENABLE ROW LEVEL SECURITY;

COMMIT;
