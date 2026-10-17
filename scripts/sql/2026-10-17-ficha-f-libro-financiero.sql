-- 2026-10-17 · Un solo libro financiero (ficha F): licencias revendidas por contrato y gastos financieros.
--
-- Por qué:
--  · LicenciaRevendida: qué parte de lo facturado a un contrato es servicio de Smarteam y cuánto se le paga al proveedor
--    por la licencia. Hasta hoy vivía fija en el código, solo para kölbi (lib/finanzas/parte-de-servicio.ts). Este SQL
--    siembra esas dos filas de kölbi para que el punto de equilibrio no cambie el día del deploy.
--  · GastoFinanciero: la comisión de Stripe, la de una transferencia internacional o la del banco, revisada movimiento
--    por movimiento sobre la copia de Mercury. Las confirmadas suman al punto de equilibrio como rubro propio.
--
-- ADITIVO: 2 tablas nuevas. Nada se dropea, nada se renombra, ninguna tabla existente cambia. Se puede correr dos veces.
--
-- ⚠ ORDEN: ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce los modelos) y el deploy se
-- revierte solo.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-17-ficha-f-libro-financiero.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`.

-- ── LicenciaRevendida ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "LicenciaRevendida" (
  "id"             TEXT NOT NULL,
  "cuentaId"       TEXT NOT NULL,
  "moneda"         TEXT NOT NULL,
  "montoContrato"  DECIMAL(14,2) NOT NULL,
  "montoServicio"  DECIMAL(14,2) NOT NULL,
  "proveedor"      TEXT NOT NULL DEFAULT 'HubSpot',
  "costoMonto"     DECIMAL(14,2),
  "costoMoneda"    TEXT,
  "costoCadaMeses" INTEGER,
  "desde"          DATE,
  "hasta"          DATE,
  "fuente"         TEXT NOT NULL,
  "notas"          TEXT,
  "archivadaEn"    TIMESTAMP(3),
  "archivadaPor"   TEXT,
  "creadoPor"      TEXT NOT NULL,
  "actualizadoPor" TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LicenciaRevendida_pkey" PRIMARY KEY ("id")
);

-- Lo que no puede pasar, en la base (las reglas viven en lib/finanzas/licencias.ts).
DO $$ BEGIN
  ALTER TABLE "LicenciaRevendida" ADD CONSTRAINT "LicenciaRevendida_montos_check"
    CHECK ("montoContrato" > 0 AND "montoServicio" >= 0 AND "montoServicio" <= "montoContrato");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "LicenciaRevendida" ADD CONSTRAINT "LicenciaRevendida_moneda_check"
    CHECK ("moneda" IN ('USD', 'CRC') AND ("costoMoneda" IS NULL OR "costoMoneda" IN ('USD', 'CRC')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- El costo va completo o no va: monto, moneda y cada cuántos meses.
DO $$ BEGIN
  ALTER TABLE "LicenciaRevendida" ADD CONSTRAINT "LicenciaRevendida_costo_check"
    CHECK (
      ("costoMonto" IS NULL AND "costoMoneda" IS NULL AND "costoCadaMeses" IS NULL)
      OR ("costoMonto" >= 0 AND "costoMoneda" IS NOT NULL AND "costoCadaMeses" BETWEEN 1 AND 36)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "LicenciaRevendida" ADD CONSTRAINT "LicenciaRevendida_vigencia_check"
    CHECK ("desde" IS NULL OR "hasta" IS NULL OR "desde" <= "hasta");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "LicenciaRevendida_cuentaId_idx" ON "LicenciaRevendida" ("cuentaId");
-- Un contrato vivo por cuenta y moneda: dos dirían dos partes de servicio distintas para los mismos cobros.
CREATE UNIQUE INDEX IF NOT EXISTS "LicenciaRevendida_una_viva_por_cuenta_y_moneda"
  ON "LicenciaRevendida" ("cuentaId", "moneda") WHERE "archivadaEn" IS NULL;

DO $$ BEGIN
  ALTER TABLE "LicenciaRevendida" ADD CONSTRAINT "LicenciaRevendida_cuentaId_fkey"
    FOREIGN KEY ("cuentaId") REFERENCES "CuentaFinanciera"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- La semilla: los dos contratos de kölbi que vivían en lib/finanzas/parte-de-servicio.ts (sin IVA, de sus anexos).
--   Anexo 1.0, dólares (p. 17): servicio US$26.700 de US$161.700.
--   Anexo 2.0, colones (p. 23): servicio ₡48.000.000 de ₡138.495.000.
-- Sin costo: lo que se le paga a HubSpot no está confirmado (Alex lo tiene que cargar). Solo si la cuenta existe.
INSERT INTO "LicenciaRevendida" ("id", "cuentaId", "moneda", "montoContrato", "montoServicio", "proveedor", "fuente", "notas", "creadoPor", "actualizadoPor")
SELECT 'licencia-kolbi-usd', 'cmv665y0n0000f4ijbo262y3q', 'USD', 161700, 26700, 'HubSpot',
       'kölbi, Anexo 1.0, p. 17', 'Licencias HubSpot + Infobip US$135.000; servicio US$19.300 + 5.000 + 2.400 de gestión.',
       'sistema:sql-2026-10-17', 'sistema:sql-2026-10-17'
WHERE EXISTS (SELECT 1 FROM "CuentaFinanciera" WHERE "id" = 'cmv665y0n0000f4ijbo262y3q')
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "LicenciaRevendida" ("id", "cuentaId", "moneda", "montoContrato", "montoServicio", "proveedor", "fuente", "notas", "creadoPor", "actualizadoPor")
SELECT 'licencia-kolbi-crc', 'cmv665y0n0000f4ijbo262y3q', 'CRC', 138495000, 48000000, 'HubSpot',
       'kölbi, Anexo 2.0, p. 23', 'Licencias HubSpot Sales ₡84.495.000 + extensión de WhatsApp ₡6.000.000; servicio ₡40.500.000 + 5.000.000 + 2.500.000 de gestión.',
       'sistema:sql-2026-10-17', 'sistema:sql-2026-10-17'
WHERE EXISTS (SELECT 1 FROM "CuentaFinanciera" WHERE "id" = 'cmv665y0n0000f4ijbo262y3q')
ON CONFLICT ("id") DO NOTHING;

-- ── GastoFinanciero ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "GastoFinanciero" (
  "id"                  TEXT NOT NULL,
  "movimientoMercuryId" TEXT NOT NULL,
  "tipo"                TEXT NOT NULL,
  "decision"            TEXT NOT NULL,
  "fecha"               DATE NOT NULL,
  "monto"               DECIMAL(12,2) NOT NULL,
  "moneda"              TEXT NOT NULL,
  "montoPropuesto"      DECIMAL(12,2),
  "descripcion"         TEXT NOT NULL,
  "decididoPor"         TEXT NOT NULL,
  "decididoEn"          TIMESTAMP(3) NOT NULL,
  "nota"                TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GastoFinanciero_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "GastoFinanciero" ADD CONSTRAINT "GastoFinanciero_tipo_check"
    CHECK ("tipo" IN ('STRIPE', 'TRANSFERENCIA_INTERNACIONAL', 'BANCO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "GastoFinanciero" ADD CONSTRAINT "GastoFinanciero_decision_check"
    CHECK ("decision" IN ('GASTO', 'NO_ES'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Un gasto confirmado tiene monto; un «No es» va en cero.
DO $$ BEGIN
  ALTER TABLE "GastoFinanciero" ADD CONSTRAINT "GastoFinanciero_monto_check"
    CHECK ("monto" >= 0 AND ("decision" = 'GASTO' OR "monto" = 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un movimiento se decide una vez: dos clics a la vez no dejan el mismo gasto dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS "GastoFinanciero_movimientoMercuryId_key" ON "GastoFinanciero" ("movimientoMercuryId");
CREATE INDEX IF NOT EXISTS "GastoFinanciero_fecha_idx" ON "GastoFinanciero" ("fecha");

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`: sin esto, los costos de licencia y
-- los gastos financieros serían leíbles con la clave pública que viaja en el navegador. RLS sin policy SELECT = cerrado;
-- la RESTRICTIVE lo mantiene cerrado aunque alguien sume mañana una policy permisiva.
ALTER TABLE "LicenciaRevendida" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "LicenciaRevendida";
CREATE POLICY deny_all_non_superuser ON "LicenciaRevendida" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

ALTER TABLE "GastoFinanciero" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "GastoFinanciero";
CREATE POLICY deny_all_non_superuser ON "GastoFinanciero" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado recién aplicado: rowsecurity = true en las dos, y las dos filas de kölbi.
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('LicenciaRevendida', 'GastoFinanciero');
--   SELECT "id", "moneda", "montoServicio" / "montoContrato" AS parte FROM "LicenciaRevendida";
