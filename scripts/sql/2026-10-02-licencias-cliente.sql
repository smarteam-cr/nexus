-- 2026-10-02 · Licencias de HubSpot de un cliente: lo que se carga A MANO.
--
-- Pedido de Liliana Moreno: fecha de compra, renovación, hubs y plan, y monto, con aviso. HubSpot
-- Partner ya trae plan, renovación y monto por hub (se lee de ClientPartnerSnapshot.properties); acá
-- va la fecha de COMPRA, que HubSpot no tiene, y lo que falta en las cuentas que Smarteam no
-- administra. Ver lib/cs/licencias.ts.
--
-- ADITIVO: 1 tabla nueva. ⛔ ORDEN: va ANTES del deploy.
--
-- Aplicar (En tu PC):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-02-licencias-cliente.sql; Remove-Item Env:ALLOW_PROD_WRITE

BEGIN;

CREATE TABLE IF NOT EXISTS "LicenciaCliente" (
  "id"              TEXT NOT NULL,
  "clientId"        TEXT NOT NULL,
  "hub"             TEXT NOT NULL,
  "plan"            TEXT,
  "fechaCompra"     TIMESTAMP(3),
  "fechaRenovacion" TIMESTAMP(3),
  "montoMensual"    DOUBLE PRECISION,
  "moneda"          TEXT,
  "nota"            TEXT,
  "actualizadoPor"  TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LicenciaCliente_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LicenciaCliente_clientId_hub_key" ON "LicenciaCliente" ("clientId", "hub");
DO $$ BEGIN
  ALTER TABLE "LicenciaCliente" ADD CONSTRAINT "LicenciaCliente_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "LicenciaCliente" ENABLE ROW LEVEL SECURITY;

COMMIT;
