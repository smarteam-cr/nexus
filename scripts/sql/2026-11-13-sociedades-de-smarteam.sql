-- 2026-11-13 · Las sociedades de Smarteam, lo que se deben entre sí y la marca de ajustes contables del mes.
--
-- POR QUÉ. Smarteam factura por más de una sociedad (CR Smarteam en Odoo, Smarteam Consultora LLC en Mercury) y
-- arranca Smart Agro, que cobra con el mismo flujo de la principal. Flywheel y Smart Agro le deben plata a CR Smarteam
-- (Odoo las lleva como cuentas por cobrar: 110303 y 110304), y CR Smarteam le transfiere a la LLC sin factura.
-- En octubre se leyó como pérdida un déficit que era contable (períodos sin liquidar, IVA rectificado, etiquetas mal
-- puestas en Odoo): el mes con ajustes pendientes queda marcado.
-- Medido el 2026-11-13 en Odoo (solo lectura): UNA compañía, la 1, «CR SMARTEAM SOCIEDAD ANONIMA».
-- Decisiones: docs/DECISIONS.md › «Las sociedades de Smarteam y lo que se deben (2026-11-13)».
--
-- QUÉ ENTRA (todo ADITIVO; se puede correr dos veces):
--   · Tabla `SociedadPropia` con RLS y sin policies, y sus cuatro filas (los alias se corrigen en la base).
--   · `CuentaFinanciera.sociedadPropiaId` (nullable: sin ella, la cuenta es de la sociedad de su vía).
--   · `FacturaOdoo.odooCompanyId` (nullable: la copia siguiente de Odoo la llena en todas).
--   · `CierreMes.ajustesContables*` (la marca del mes; default false).
--   · Tabla `MovimientoEntreSociedades` con RLS y sin policies (la llena la copia de Odoo cada hora).
--
-- ⛔ ORDEN: esto va ANTES del deploy. /api/health responde 503 sin las columnas y deploy.sh revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-11-13-sociedades-de-smarteam.sql
--   Después:     npx prisma generate · reiniciar el dev server · npm run check:esquema
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.

-- ── 1. Las sociedades ────────────────────────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "SociedadPropia" (
    "id"            TEXT         NOT NULL,
    "clave"         TEXT         NOT NULL,
    "nombre"        TEXT         NOT NULL,
    "razonSocial"   TEXT,
    "cedula"        TEXT,
    "pais"          TEXT,
    "plataforma"    TEXT         NOT NULL DEFAULT 'NINGUNA',
    "odooCompanyId" INTEGER,
    "alias"         TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "principal"     BOOLEAN      NOT NULL DEFAULT false,
    "activa"        BOOLEAN      NOT NULL DEFAULT true,
    "orden"         INTEGER      NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SociedadPropia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SociedadPropia_clave_key" ON "SociedadPropia"("clave");
CREATE UNIQUE INDEX IF NOT EXISTS "SociedadPropia_odooCompanyId_key" ON "SociedadPropia"("odooCompanyId");
-- Una sola principal (Prisma no modela índices parciales).
CREATE UNIQUE INDEX IF NOT EXISTS "SociedadPropia_una_principal" ON "SociedadPropia"("principal") WHERE "principal";

DO $$ BEGIN
  ALTER TABLE "SociedadPropia" ADD CONSTRAINT "SociedadPropia_plataforma_valida"
    CHECK ("plataforma" IN ('ODOO', 'MERCURY', 'NINGUNA'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "SociedadPropia" ENABLE ROW LEVEL SECURITY;

-- Las cuatro. ON CONFLICT DO NOTHING: correrlo otra vez no pisa lo que alguien corrigió en la base.
-- Los nombres salen de Odoo (la compañía 1 y los contactos «Smarteam Consultora LLC», «FLYWHEEL CENTRO AMERICA») y de
-- Mercury («CR SMARTEAM SOCIEDAD ANONIMA» le transfiere a «SMARTEAM CONSULT»).
INSERT INTO "SociedadPropia" ("id", "clave", "nombre", "razonSocial", "cedula", "pais", "plataforma", "odooCompanyId", "alias", "principal", "orden")
VALUES
  ('soc_cr_smarteam', 'cr-smarteam', 'CR Smarteam', 'CR SMARTEAM SOCIEDAD ANONIMA', '3101813655', 'CR', 'ODOO', 1,
     ARRAY['cr smarteam', 'smarteam sociedad anonima', 'smarteam s.a'], true, 1),
  ('soc_smarteam_llc', 'smarteam-llc', 'Smarteam Consultora LLC', 'Smarteam Consultora LLC', '38-4365364', 'US', 'MERCURY', NULL,
     ARRAY['smarteam consult', 'smarteam consultora', 'smarteam consultoria'], false, 2),
  ('soc_smartagro', 'smartagro', 'Smart Agro', NULL, NULL, 'CR', 'NINGUNA', NULL,
     ARRAY['smartagro', 'smart agro', 'smarteam agropecuario'], false, 3),
  ('soc_flywheel', 'flywheel', 'Flywheel', 'Flywheel Centroamérica S.A.', NULL, 'CR', 'NINGUNA', NULL,
     ARRAY['flywheel'], false, 4)
ON CONFLICT ("clave") DO NOTHING;

-- ── 2. De qué sociedad es cada cuenta de cobranza ────────────────────────────────────────────────────────────────────

ALTER TABLE "CuentaFinanciera" ADD COLUMN IF NOT EXISTS "sociedadPropiaId" TEXT;
DO $$ BEGIN
  ALTER TABLE "CuentaFinanciera" ADD CONSTRAINT "CuentaFinanciera_sociedadPropiaId_fkey"
    FOREIGN KEY ("sociedadPropiaId") REFERENCES "SociedadPropia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. De qué compañía de Odoo es cada factura ───────────────────────────────────────────────────────────────────────

ALTER TABLE "FacturaOdoo" ADD COLUMN IF NOT EXISTS "odooCompanyId" INTEGER;

-- ── 4. La marca de ajustes contables del mes ─────────────────────────────────────────────────────────────────────────

ALTER TABLE "CierreMes" ADD COLUMN IF NOT EXISTS "ajustesContablesPendientes" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CierreMes" ADD COLUMN IF NOT EXISTS "ajustesContablesNota" TEXT;
ALTER TABLE "CierreMes" ADD COLUMN IF NOT EXISTS "ajustesContablesPor" TEXT;
ALTER TABLE "CierreMes" ADD COLUMN IF NOT EXISTS "ajustesContablesEn" TIMESTAMP(3);

-- ── 5. Lo que se mueve entre sociedades y entre cuentas propias ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "MovimientoEntreSociedades" (
    "id"             TEXT           NOT NULL,
    "origen"         TEXT           NOT NULL,
    "odooLineId"     INTEGER,
    "odooCompanyId"  INTEGER,
    "fecha"          DATE           NOT NULL,
    "sociedadId"     TEXT           NOT NULL,
    "contraparteId"  TEXT,
    "monto"          DECIMAL(14,2)  NOT NULL,
    "moneda"         TEXT           NOT NULL,
    "tipo"           TEXT           NOT NULL,
    "respaldo"       TEXT           NOT NULL,
    "concepto"       TEXT,
    "asiento"        TEXT,
    "cuentaContable" TEXT,
    "diario"         TEXT,
    "factura"        TEXT,
    "aceptadoPor"    TEXT,
    "aceptadoEn"     TIMESTAMP(3),
    "aceptadoNota"   TEXT,
    "anotadoPor"     TEXT,
    "estado"         TEXT           NOT NULL DEFAULT 'VIGENTE',
    "sincronizadoEn" TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MovimientoEntreSociedades_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MovimientoEntreSociedades_odooLineId_key" ON "MovimientoEntreSociedades"("odooLineId");
CREATE INDEX IF NOT EXISTS "MovimientoEntreSociedades_sociedadId_contraparteId_estado_idx"
  ON "MovimientoEntreSociedades"("sociedadId", "contraparteId", "estado");
CREATE INDEX IF NOT EXISTS "MovimientoEntreSociedades_respaldo_estado_idx" ON "MovimientoEntreSociedades"("respaldo", "estado");
CREATE INDEX IF NOT EXISTS "MovimientoEntreSociedades_fecha_idx" ON "MovimientoEntreSociedades"("fecha");

DO $$ BEGIN
  ALTER TABLE "MovimientoEntreSociedades" ADD CONSTRAINT "MovimientoEntreSociedades_sociedadId_fkey"
    FOREIGN KEY ("sociedadId") REFERENCES "SociedadPropia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MovimientoEntreSociedades" ADD CONSTRAINT "MovimientoEntreSociedades_contraparteId_fkey"
    FOREIGN KEY ("contraparteId") REFERENCES "SociedadPropia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "MovimientoEntreSociedades" ADD CONSTRAINT "MovimientoEntreSociedades_valores"
    CHECK ("origen" IN ('ODOO', 'MANUAL')
       AND "tipo" IN ('FACTURA', 'TRANSFERENCIA', 'MOVIMIENTO')
       AND "respaldo" IN ('FACTURA', 'CONCILIADA', 'SIN_RESPALDO')
       AND "estado" IN ('VIGENTE', 'DESAPARECIDA', 'ANULADA'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Lo de Odoo trae su línea; lo anotado, no.
DO $$ BEGIN
  ALTER TABLE "MovimientoEntreSociedades" ADD CONSTRAINT "MovimientoEntreSociedades_origen_y_linea"
    CHECK (("origen" = 'ODOO') = ("odooLineId" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "MovimientoEntreSociedades" ENABLE ROW LEVEL SECURITY;

-- ── 4. La sociedad de las cuentas de banco y los pagos de la caja ───────────────────────────────────────────────────
-- La caja (2026-11-13-caja-y-pagos.sql) guarda la sociedad como FK opcional a esta tabla. Ese archivo corre ANTES que
-- este por el nombre y pone la FK solo si "SociedadPropia" ya existe; si no existía, la pone este bloque. El mismo
-- bloque en los dos: da igual el orden y se pueden correr dos veces.
DO $$
BEGIN
  IF to_regclass('"CuentaDeBanco"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CuentaDeBanco_sociedadId_fkey') THEN
    ALTER TABLE "CuentaDeBanco" ADD CONSTRAINT "CuentaDeBanco_sociedadId_fkey"
      FOREIGN KEY ("sociedadId") REFERENCES "SociedadPropia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF to_regclass('"PagoComprometido"') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PagoComprometido_sociedadId_fkey') THEN
    ALTER TABLE "PagoComprometido" ADD CONSTRAINT "PagoComprometido_sociedadId_fkey"
      FOREIGN KEY ("sociedadId") REFERENCES "SociedadPropia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
