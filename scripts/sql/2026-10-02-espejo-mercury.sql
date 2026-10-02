-- 2026-10-02 · Espejo de Mercury: facturas, clientes y movimientos, de solo lectura
--
-- Pedido de Elías (2026-10-02): lo internacional se factura en Mercury (sección de facturas) desde noviembre de 2025
-- —76 facturas, INV-1 a INV-72, 30 clientes— y Nexus no lo veía: los 106 cobros de las 24 cuentas que facturan por
-- Mercury no se comparaban con nada. Nexus copia lo que Mercury dice con un token de SOLO LECTURA, igual que copia
-- Odoo (lib/cobranza/mercury/). Ver docs/mercury-decisiones.md.
--
-- ADITIVO: 4 tablas nuevas. Ninguna tabla existente cambia, así que el código que corre hoy no se entera.
-- Re-ejecutable: la base local re-aplica todos los SQL con fecha en cada bootstrap.
--
-- ⛔ ORDEN: esto va ANTES del deploy. Sin las tablas, la revisión de salud del deploy lo revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-02-espejo-mercury.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

BEGIN;

-- ── Las facturas ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "FacturaMercury" (
  "id"                   TEXT NOT NULL,
  "mercuryInvoiceId"     TEXT NOT NULL,
  "numero"               TEXT NOT NULL,
  "invoiceDate"          DATE NOT NULL,
  "dueDate"              DATE,
  "monto"                DECIMAL(14, 2) NOT NULL,
  "moneda"               TEXT NOT NULL,
  "estado"               TEXT NOT NULL,
  "mercuryCustomerId"    TEXT NOT NULL,
  "clienteNombre"        TEXT NOT NULL,
  "canceladaEn"          TIMESTAMP(3),
  "creadaEnMercury"      TIMESTAMP(3) NOT NULL,
  "actualizadaEnMercury" TIMESTAMP(3) NOT NULL,
  "estadoEspejo"         TEXT NOT NULL DEFAULT 'VIGENTE',
  "sincronizadoEn"       TIMESTAMP(3) NOT NULL,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FacturaMercury_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacturaMercury_estadoEspejo_check" CHECK ("estadoEspejo" IN ('VIGENTE', 'DESAPARECIDA'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "FacturaMercury_mercuryInvoiceId_key" ON "FacturaMercury" ("mercuryInvoiceId");
CREATE INDEX IF NOT EXISTS "FacturaMercury_mercuryCustomerId_idx" ON "FacturaMercury" ("mercuryCustomerId");
CREATE INDEX IF NOT EXISTS "FacturaMercury_invoiceDate_idx" ON "FacturaMercury" ("invoiceDate");

-- ── Los clientes, y con qué cuenta de Nexus están emparejados ───────────────────────
CREATE TABLE IF NOT EXISTS "ClienteMercury" (
  "id"                TEXT NOT NULL,
  "mercuryCustomerId" TEXT NOT NULL,
  "nombre"            TEXT NOT NULL,
  "correo"            TEXT,
  "pais"              TEXT,
  "cuentaId"          TEXT,
  "sociedadId"        TEXT,
  "via"               TEXT,
  "ignorado"          BOOLEAN NOT NULL DEFAULT false,
  "confirmadoPor"     TEXT,
  "confirmadoEn"      TIMESTAMP(3),
  "estadoEspejo"      TEXT NOT NULL DEFAULT 'VIGENTE',
  "sincronizadoEn"    TIMESTAMP(3) NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClienteMercury_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClienteMercury_estadoEspejo_check" CHECK ("estadoEspejo" IN ('VIGENTE', 'DESAPARECIDA')),
  CONSTRAINT "ClienteMercury_via_check" CHECK ("via" IS NULL OR "via" IN ('NOMBRE', 'MONTO', 'MANUAL')),
  -- Emparejado con una cuenta o marcado ajeno, nunca las dos cosas.
  CONSTRAINT "ClienteMercury_cuenta_o_ignorado" CHECK (NOT ("ignorado" AND "cuentaId" IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClienteMercury_mercuryCustomerId_key" ON "ClienteMercury" ("mercuryCustomerId");
CREATE INDEX IF NOT EXISTS "ClienteMercury_cuentaId_idx" ON "ClienteMercury" ("cuentaId");
DO $$ BEGIN
  ALTER TABLE "ClienteMercury" ADD CONSTRAINT "ClienteMercury_cuentaId_fkey"
    FOREIGN KEY ("cuentaId") REFERENCES "CuentaFinanciera"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ClienteMercury" ADD CONSTRAINT "ClienteMercury_sociedadId_fkey"
    FOREIGN KEY ("sociedadId") REFERENCES "OdooPartnerVinculo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Los movimientos de las cuentas ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "MovimientoMercury" (
  "id"                   TEXT NOT NULL,
  "mercuryTransactionId" TEXT NOT NULL,
  "mercuryAccountId"     TEXT NOT NULL,
  "monto"                DECIMAL(14, 2) NOT NULL,
  "estado"               TEXT NOT NULL,
  "tipo"                 TEXT NOT NULL,
  "contraparteNombre"    TEXT,
  "contraparteId"        TEXT,
  "descripcionBanco"     TEXT,
  "nota"                 TEXT,
  "memoExterno"          TEXT,
  "conTarjeta"           BOOLEAN NOT NULL DEFAULT false,
  "creadoEnMercury"      TIMESTAMP(3) NOT NULL,
  "posteadoEn"           TIMESTAMP(3),
  "estadoEspejo"         TEXT NOT NULL DEFAULT 'VIGENTE',
  "sincronizadoEn"       TIMESTAMP(3) NOT NULL,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MovimientoMercury_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MovimientoMercury_estadoEspejo_check" CHECK ("estadoEspejo" IN ('VIGENTE', 'DESAPARECIDA'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "MovimientoMercury_mercuryTransactionId_key" ON "MovimientoMercury" ("mercuryTransactionId");
CREATE INDEX IF NOT EXISTS "MovimientoMercury_posteadoEn_idx" ON "MovimientoMercury" ("posteadoEn");

-- ── Cada copia, buena o mala ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SyncMercuryCorrida" (
  "id"                TEXT NOT NULL,
  "iniciadaEn"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "terminadaEn"       TIMESTAMP(3),
  "ok"                BOOLEAN NOT NULL DEFAULT false,
  "parcial"           BOOLEAN NOT NULL DEFAULT false,
  "disparadaPor"      TEXT NOT NULL,
  "facturasVistas"    INTEGER NOT NULL DEFAULT 0,
  "clientesVistos"    INTEGER NOT NULL DEFAULT 0,
  "movimientosVistos" INTEGER NOT NULL DEFAULT 0,
  "creadas"           INTEGER NOT NULL DEFAULT 0,
  "actualizadas"      INTEGER NOT NULL DEFAULT 0,
  "desaparecidas"     INTEGER NOT NULL DEFAULT 0,
  "clientesNuevos"    INTEGER NOT NULL DEFAULT 0,
  "error"             TEXT,
  "duracionMs"        INTEGER,
  CONSTRAINT "SyncMercuryCorrida_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SyncMercuryCorrida_iniciadaEn_idx" ON "SyncMercuryCorrida" ("iniciadaEn");
CREATE INDEX IF NOT EXISTS "SyncMercuryCorrida_ok_iniciadaEn_idx" ON "SyncMercuryCorrida" ("ok", "iniciadaEn");

-- OBLIGATORIO: Supabase le da SELECT a `anon` sobre todo `public`, y esto es plata y datos de clientes. RLS sin ninguna
-- policy = nadie lo lee con la clave pública; Nexus entra con el rol del servidor, que no pasa por RLS.
ALTER TABLE "FacturaMercury" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClienteMercury" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MovimientoMercury" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncMercuryCorrida" ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado: 4 filas, todas con relrowsecurity = true.
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('FacturaMercury', 'ClienteMercury', 'MovimientoMercury', 'SyncMercuryCorrida');
