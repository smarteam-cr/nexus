-- 2026-10-25 · La comisión de HubSpot sale de HubSpot Partner (U25) y la copia de Partner pasa a columnas (U29).
--
-- POR QUÉ. La comisión del trimestre de HubSpot se cargaba a mano (US$51.000 estimados para el 15 de noviembre),
-- mientras la copia de Partner ya traía la comisión proyectada de cada cuenta. Medido el 2026-10-24: es MENSUAL,
-- el 20 % del MRR vendido de cada cuenta, y prorrateada por la fecha de inicio de cada venta reconstruye los pagos
-- de febrero, mayo y agosto con menos de un 9 % de diferencia. Lo vendido, las fechas de la relación, la comisión y
-- el MRR por hub vivían solo en el Json crudo (`properties`), sin historial semana a semana.
-- Plan: docs/integracion-hubspot-partners-plan.md (U25 y U29).
--
-- QUÉ ENTRA. Solo columnas nullable (y un booleano con default):
--   · ClientPartnerSnapshot — lo vendido, las fechas de la relación, la comisión proyectada y el MRR por hub.
--   · PartnerUsageSnapshot  — la comisión, el MRR gestionado, el vendido y el MRR por hub, semana a semana.
--   · ComisionPartner       — `montoDesdePartner` (el monto lo arma el job `comisiones-hubspot-estimado`) y
--                              `detalleDePartner` (el detalle por cuenta del último estimado).
--
-- ADITIVO y se puede correr dos veces: ADD COLUMN IF NOT EXISTS. El código viejo no conoce estas columnas y sigue
-- igual durante la ventana del deploy. Sin tablas nuevas, así que no hace falta habilitar RLS: las tres ya lo tienen.
-- Las columnas nuevas de la copia nacen vacías; las llena la próxima copia diaria o, antes, el backfill desde el
-- crudo (`scripts/partner-columnas.ts`, simulacro y `--apply`).
--
-- Aplicación:
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-10-25-comisiones-partner.sql
--   npx prisma generate   ·   npm run check:invariants  (INV50)

ALTER TABLE "ClientPartnerSnapshot"
    ADD COLUMN IF NOT EXISTS "isManaged"                   BOOLEAN,
    ADD COLUMN IF NOT EXISTS "isSold"                      BOOLEAN,
    ADD COLUMN IF NOT EXISTS "soldMrr"                     DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "soldProductLines"            TEXT,
    ADD COLUMN IF NOT EXISTS "soldRelationshipStartAt"     TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "soldRelationshipEndAt"       TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "relationshipStartAt"         TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "relationshipEndAt"           TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "managedRelationshipStartAt"  TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "managedRelationshipEndAt"    TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "projectedCommission"         DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "projectedCommissionCurrency" TEXT,
    ADD COLUMN IF NOT EXISTS "projectedCommissionAt"       TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "mrrByHub"                    JSONB;

ALTER TABLE "PartnerUsageSnapshot"
    ADD COLUMN IF NOT EXISTS "isManaged"           BOOLEAN,
    ADD COLUMN IF NOT EXISTS "mrrManaged"          DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "soldMrr"             DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "projectedCommission" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "mrrByHub"            JSONB;

ALTER TABLE "ComisionPartner"
    ADD COLUMN IF NOT EXISTS "montoDesdePartner" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "detalleDePartner"  JSONB;
