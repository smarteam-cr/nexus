-- 2026-10-26 · Las líneas del banco de Odoo sin conciliar (U15).
--
-- POR QUÉ. Odoo tiene 98 líneas del banco sin conciliar (eran 14 en septiembre) que Nexus no veía: medido el
-- 2026-10-25, 4 son plata que entró (todas en BAC Dólares) y 94 son salidas (las tarjetas VISA y pagos). Elías decidió
-- que Alex las revisa en Nexus: la copia de Odoo las trae cada hora, en solo lectura, y aparecen en Cobranza ›
-- Conciliación › «Lo que no cuadra», en dos filas propias (entradas y salidas).
-- Plan: docs/integraciones-finanzas-ia-plan.md (U15).
--
-- QUÉ ENTRA. Una tabla nueva, `MovimientoBancoOdoo`, con RLS y sin policies (como todo el espejo: solo la lee Prisma).
-- No toca ningún `Cobro` ni nada que cobre.
--
-- ADITIVO y se puede correr dos veces: CREATE TABLE / INDEX IF NOT EXISTS. El código viejo no conoce la tabla.
--
-- Aplicación:
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-10-26-banco-odoo.sql
--   npx prisma generate   ·   npm run check:invariants  (INV60)

CREATE TABLE IF NOT EXISTS "MovimientoBancoOdoo" (
    "id"                TEXT           NOT NULL,
    "odooLineId"        INTEGER        NOT NULL,
    "fecha"             DATE           NOT NULL,
    "monto"             DECIMAL(14,2)  NOT NULL,
    "moneda"            TEXT           NOT NULL,
    "montoOtraMoneda"   DECIMAL(14,2),
    "otraMoneda"        TEXT,
    "referencia"        TEXT,
    "odooPartnerId"     INTEGER,
    "odooPartnerNombre" TEXT,
    "odooJournalId"     INTEGER        NOT NULL,
    "diario"            TEXT           NOT NULL,
    "extracto"          TEXT,
    "asiento"           TEXT,
    "estadoEspejo"      TEXT           NOT NULL DEFAULT 'SIN_CONCILIAR',
    "vistaEn"           TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradaEn"         TIMESTAMP(3),
    "sincronizadoEn"    TIMESTAMP(3)   NOT NULL,
    "createdAt"         TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3)   NOT NULL,
    CONSTRAINT "MovimientoBancoOdoo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MovimientoBancoOdoo_odooLineId_key" ON "MovimientoBancoOdoo"("odooLineId");
CREATE INDEX IF NOT EXISTS "MovimientoBancoOdoo_estadoEspejo_fecha_idx" ON "MovimientoBancoOdoo"("estadoEspejo", "fecha");

ALTER TABLE "MovimientoBancoOdoo" ENABLE ROW LEVEL SECURITY;
