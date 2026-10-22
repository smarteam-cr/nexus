-- 2026-10-21 · Comisiones de aliado: el monto real de la factura, y el cero.
--
-- POR QUÉ. Hasta hoy «estimado o real» dependía del estado: toda comisión por cobrar era
-- estimada y toda cobrada, real. Pero la comisión se anota primero como estimado (un
-- prorrateo) y pasa a real cuando llega la factura del aliado, que puede llegar semanas
-- antes de que entre la plata (kölbi, 2026-10-21). Y hay trimestres en cero: Atom Chat
-- avisó que este no genera comisión (feedback #17 de María José Zamora).
-- Decisión completa: docs/DECISIONS.md › «Comisiones de aliado: estimado, real de la
-- factura y cero».
--
-- QUÉ ENTRA. Cuatro columnas nullable y un CHECK:
--   · montoEstimado — lo que decía el estimado antes de pasar a real.
--   · facturaAliado — la referencia de la factura del aliado (opcional).
--   · montoRealPor / montoRealEn — quién y cuándo dio el monto por real.
--   · CHECK "monto" >= 0 — el monto acepta cero, nunca negativo. Espejo del Zod.
--
-- ADITIVO y se puede correr dos veces: ADD COLUMN IF NOT EXISTS y el CHECK dentro de un
-- DO que mira pg_constraint. El código viejo no conoce estas columnas y sigue igual
-- durante la ventana de deploy. Sin backfill: lo que ya está cobrado es real por el banco
-- y lo que está por cobrar sigue estimado hasta que alguien registre su factura.
--
-- ⚠ SIN deny-all RESTRICTIVE, igual que sus hermanas: `ComisionPartner` es un INGRESO y
-- su superficie es la de ADMIN. RLS ya está habilitado en la tabla (2026-08-16).
--
-- Aplicación:
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-10-21-comision-partner-monto-real.sql
--   npx prisma generate   ·   npm run check:invariants  (INV20 debe seguir verde)

ALTER TABLE "ComisionPartner"
    ADD COLUMN IF NOT EXISTS "montoEstimado" DECIMAL(12,2),
    ADD COLUMN IF NOT EXISTS "facturaAliado" TEXT,
    ADD COLUMN IF NOT EXISTS "montoRealPor"  TEXT,
    ADD COLUMN IF NOT EXISTS "montoRealEn"   TIMESTAMP(3);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ComisionPartner_monto_no_negativo'
    ) THEN
        ALTER TABLE "ComisionPartner"
            ADD CONSTRAINT "ComisionPartner_monto_no_negativo" CHECK ("monto" >= 0);
    END IF;
END $$;
