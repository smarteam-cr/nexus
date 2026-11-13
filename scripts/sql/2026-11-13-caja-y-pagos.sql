-- 2026-11-13 · La caja y los pagos: saldos de banco, pagos comprometidos, reservas y la revisión diaria.
--
-- POR QUÉ. Marco calcula de cabeza cuánto habrá al cierre del año (~150.000): el saldo de cada cuenta, más lo que
-- falta cobrar y la comisión de HubSpot, menos lo que hay que pagar y lo apartado. Nexus ya proyecta lo que entra y lo
-- que sale (la caja neta), pero no sabe cuánto hay hoy en el banco ni qué pagos están comprometidos. Y María José, que
-- asume cobros y pagos desde el 15 de noviembre, necesita la lista de pagos de cada semana según la política aprobada.
-- Decisión completa: docs/DECISIONS.md › «La caja y los pagos».
--
-- QUÉ ENTRA. Cuatro enums y cuatro tablas nuevas:
--   CuentaDeBanco     las cuentas (BCR colones, la de dólares, las de Mercury), con la sociedad en texto libre
--   SaldoDeCuenta     el saldo de una cuenta un día (a mano, o leído de Mercury por su copia diaria)
--   PagoComprometido  un pago comprometido o una reserva, con lo que la política necesita para fecharlo
--   RevisionDeCaja    quién revisó la caja cada día
--
-- ADITIVO y se puede correr dos veces. El código viejo no conoce estas tablas.
-- ⚠ deny-all RESTRICTIVE, como las demás tablas de costos (también en prisma/policies.sql).
--
-- Aplicación:
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-11-13-caja-y-pagos.sql
--   npx prisma generate   ·   npm run check:esquema

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrigenDeSaldo') THEN
    CREATE TYPE "OrigenDeSaldo" AS ENUM ('MANUAL', 'MERCURY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoDeCompromiso') THEN
    CREATE TYPE "TipoDeCompromiso" AS ENUM ('PAGO', 'RESERVA');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CategoriaDePago') THEN
    CREATE TYPE "CategoriaDePago" AS ENUM (
      'PLANILLA', 'IMPUESTOS_Y_CARGAS', 'SERVICIOS_PROFESIONALES', 'COMISIONISTA', 'ARTICULO_FISICO', 'HERRAMIENTA', 'OTRO'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EstadoDeCompromiso') THEN
    CREATE TYPE "EstadoDeCompromiso" AS ENUM ('PENDIENTE', 'PAGADO', 'ANULADO');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CuentaDeBanco" (
  "id"               TEXT NOT NULL,
  "nombre"           TEXT NOT NULL,
  "moneda"           "CobranzaMoneda" NOT NULL,
  "origen"           "OrigenDeSaldo" NOT NULL DEFAULT 'MANUAL',
  "mercuryAccountId" TEXT,
  "sociedad"         TEXT,
  "activa"           BOOLEAN NOT NULL DEFAULT true,
  "orden"            INTEGER NOT NULL DEFAULT 0,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CuentaDeBanco_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CuentaDeBanco_mercuryAccountId_key" ON "CuentaDeBanco" ("mercuryAccountId");

CREATE TABLE IF NOT EXISTS "SaldoDeCuenta" (
  "id"            TEXT NOT NULL,
  "cuentaId"      TEXT NOT NULL,
  "fecha"         DATE NOT NULL,
  "monto"         DECIMAL(14, 2) NOT NULL,
  "montoContable" DECIMAL(14, 2),
  "origen"        "OrigenDeSaldo" NOT NULL,
  "registradoPor" TEXT NOT NULL,
  "nota"          TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SaldoDeCuenta_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SaldoDeCuenta_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaDeBanco"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "SaldoDeCuenta_cuentaId_fecha_key" ON "SaldoDeCuenta" ("cuentaId", "fecha");
CREATE INDEX IF NOT EXISTS "SaldoDeCuenta_fecha_idx" ON "SaldoDeCuenta" ("fecha");

CREATE TABLE IF NOT EXISTS "PagoComprometido" (
  "id"                TEXT NOT NULL,
  "tipo"              "TipoDeCompromiso" NOT NULL DEFAULT 'PAGO',
  "concepto"          TEXT NOT NULL,
  "beneficiario"      TEXT,
  "categoria"         "CategoriaDePago" NOT NULL DEFAULT 'OTRO',
  "monto"             DECIMAL(14, 2) NOT NULL,
  "moneda"            "CobranzaMoneda" NOT NULL,
  "fecha"             DATE,
  "facturaRecibidaEl" DATE,
  "entregadoEl"       DATE,
  "adelantoPct"       INTEGER NOT NULL DEFAULT 0,
  "adelantoPagadoEl"  DATE,
  "cobroId"           TEXT,
  "estado"            "EstadoDeCompromiso" NOT NULL DEFAULT 'PENDIENTE',
  "pagadoEl"          DATE,
  "pagadoPor"         TEXT,
  "sociedad"          TEXT,
  "nota"              TEXT,
  "registradoPor"     TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PagoComprometido_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PagoComprometido_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "Cobro"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PagoComprometido_monto_positivo" CHECK ("monto" > 0),
  CONSTRAINT "PagoComprometido_adelanto_rango" CHECK ("adelantoPct" BETWEEN 0 AND 50),
  CONSTRAINT "PagoComprometido_reserva_con_fecha" CHECK ("tipo" <> 'RESERVA' OR "fecha" IS NOT NULL),
  CONSTRAINT "PagoComprometido_pagado_entero" CHECK (("estado" = 'PAGADO') = ("pagadoEl" IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS "PagoComprometido_estado_tipo_idx" ON "PagoComprometido" ("estado", "tipo");
CREATE INDEX IF NOT EXISTS "PagoComprometido_cobroId_idx" ON "PagoComprometido" ("cobroId");

CREATE TABLE IF NOT EXISTS "RevisionDeCaja" (
  "id"          TEXT NOT NULL,
  "fecha"       DATE NOT NULL,
  "revisadoPor" TEXT NOT NULL,
  "revisadoEn"  TIMESTAMP(3) NOT NULL,
  "nota"        TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevisionDeCaja_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RevisionDeCaja_fecha_key" ON "RevisionDeCaja" ("fecha");

ALTER TABLE "CuentaDeBanco" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaldoDeCuenta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PagoComprometido" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RevisionDeCaja" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "CuentaDeBanco";
CREATE POLICY deny_all_non_superuser ON "CuentaDeBanco" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "SaldoDeCuenta";
CREATE POLICY deny_all_non_superuser ON "SaldoDeCuenta" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "PagoComprometido";
CREATE POLICY deny_all_non_superuser ON "PagoComprometido" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "RevisionDeCaja";
CREATE POLICY deny_all_non_superuser ON "RevisionDeCaja" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- Las dos cuentas que se cargan a mano, para que el primer saldo no espere a que alguien las cree. Sin saldo: nacen
-- vacías y la pantalla dice «sin saldo». Las de Mercury las crea su copia diaria, con su nombre real.
INSERT INTO "CuentaDeBanco" ("id", "nombre", "moneda", "origen", "orden", "updatedAt")
SELECT 'cuenta-bcr-colones', 'Banco de Costa Rica (colones)', 'CRC', 'MANUAL', 1, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "CuentaDeBanco" WHERE "id" = 'cuenta-bcr-colones');
INSERT INTO "CuentaDeBanco" ("id", "nombre", "moneda", "origen", "orden", "updatedAt")
SELECT 'cuenta-dolares', 'Cuenta en dólares', 'USD', 'MANUAL', 2, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "CuentaDeBanco" WHERE "id" = 'cuenta-dolares');
