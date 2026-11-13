-- 2026-11-13 · Gastos fijos y variables, las reglas de gasto y el aviso de tipo de cambio de la planilla
-- (DECISIONS «Gastos fijos y variables, las reglas de gasto y el tipo de cambio de la planilla»).
--
-- Por qué:
--   · "GastoPuntual" (el gasto VARIABLE) gana lo que piden las dos reglas de gasto y la factura:
--       tipo (de representación, con la tarjeta corporativa u otro), rubro (en qué fue), avisoPrevio (representación se
--       avisa antes), comprobante + quién y cuándo lo anotó (la factura que recopila quien registra), y pasoAFijoId: el
--       fijo en que se volvió el gasto cuando alguien dijo «esto se repite».
--   · "CostoRecurrente" (el gasto FIJO) gana presupuesto: cada suscripción con su presupuesto estimado. No entra a
--     ninguna proyección; solo se compara.
--   · "UmbralTipoCambio": los dos topes del aviso de tipo de cambio de la planilla (3 % vigilar, 5 % decidir), editables
--     por Super Admin. Una fila. Sin fila, el código usa 3 y 5.
--
-- ADITIVO: 2 tipos, 8 columnas nullable o con default, 1 tabla nueva con RLS. Nada se dropea ni se renombra. Inocuo con
-- el código viejo corriendo. Se puede correr dos veces.
--
-- ⛔ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 y deploy.sh revierte solo.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-11-13-gastos-fijos-reglas-y-tipo-de-cambio.sql; Remove-Item Env:ALLOW_PROD_WRITE
--   Después: npx prisma generate  +  reiniciar el dev server.
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GastoTipo') THEN
    CREATE TYPE "GastoTipo" AS ENUM ('REPRESENTACION', 'TARJETA_CORPORATIVA', 'OTRO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GastoRubro') THEN
    CREATE TYPE "GastoRubro" AS ENUM ('COMBUSTIBLE', 'ALIMENTACION', 'EQUIPO', 'SUSCRIPCION', 'SOFTWARE', 'OTRO');
  END IF;
END $$;

-- ── GastoPuntual ──────────────────────────────────────────────────────────────
ALTER TABLE "GastoPuntual" ADD COLUMN IF NOT EXISTS "tipo" "GastoTipo";
ALTER TABLE "GastoPuntual" ADD COLUMN IF NOT EXISTS "rubro" "GastoRubro";
ALTER TABLE "GastoPuntual" ADD COLUMN IF NOT EXISTS "avisoPrevio" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GastoPuntual" ADD COLUMN IF NOT EXISTS "comprobante" TEXT;
ALTER TABLE "GastoPuntual" ADD COLUMN IF NOT EXISTS "comprobantePor" TEXT;
ALTER TABLE "GastoPuntual" ADD COLUMN IF NOT EXISTS "comprobanteEn" TIMESTAMP(3);
ALTER TABLE "GastoPuntual" ADD COLUMN IF NOT EXISTS "pasoAFijoId" TEXT;

DO $$ BEGIN
  ALTER TABLE "GastoPuntual" ADD CONSTRAINT "GastoPuntual_pasoAFijoId_fkey"
    FOREIGN KEY ("pasoAFijoId") REFERENCES "CostoRecurrente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── CostoRecurrente ───────────────────────────────────────────────────────────
ALTER TABLE "CostoRecurrente" ADD COLUMN IF NOT EXISTS "presupuesto" DECIMAL(12, 2);

DO $$ BEGIN
  ALTER TABLE "CostoRecurrente" ADD CONSTRAINT "CostoRecurrente_presupuesto_positivo" CHECK ("presupuesto" IS NULL OR "presupuesto" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── UmbralTipoCambio ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "UmbralTipoCambio" (
  "id"             TEXT NOT NULL DEFAULT 'planilla',
  "vigilarPct"     DECIMAL(5, 2) NOT NULL,
  "decidirPct"     DECIMAL(5, 2) NOT NULL,
  "actualizadoPor" TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UmbralTipoCambio_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "UmbralTipoCambio" ADD CONSTRAINT "UmbralTipoCambio_rango"
    CHECK ("vigilarPct" > 0 AND "decidirPct" > "vigilarPct" AND "decidirPct" <= 50);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RLS en toda tabla nueva (ARCHITECTURE §4.5). Sin policy: la lee solo el servidor (Prisma bypassa).
ALTER TABLE "UmbralTipoCambio" ENABLE ROW LEVEL SECURITY;
