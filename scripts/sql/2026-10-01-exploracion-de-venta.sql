-- 2026-10-01 · Exploraciones de venta: un lienzo por empresa que guía la exploración (Ventas → Exploraciones).
--
-- Pedido de Elías (2026-09-30): entre el test de marketing y la primera propuesta no había proceso.
-- El vendedor elige una empresa del HubSpot de Smarteam y obtiene un lienzo que guía las dos
-- reuniones, estima el nivel de cada dimensión como lo hace el chequeo de la escala, arma la
-- propuesta y le llega al CSE en el handoff (lib/exploraciones). El agente PROPONE (columna
-- `propuesta`); lo que el vendedor confirma vive en `contenido`.
--
-- ADITIVO: 1 tabla + 1 columna nullable en "BusinessCase". Nada que backfillear.
-- Re-ejecutable: la base local re-aplica todos los SQL con fecha en cada bootstrap.
--
-- ⛔ ORDEN: esto va ANTES del deploy. La página nueva lee la tabla y toda consulta de propuestas
-- pide la columna nueva; si el deploy llega primero, la revisión de salud lo revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-01-exploracion-de-venta.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

CREATE TABLE IF NOT EXISTS "ExploracionDeVenta" (
  "id"               TEXT NOT NULL,
  "clientId"         TEXT NOT NULL,
  "edicion"          TEXT,
  "perfilCierre"     TEXT,
  "perfilDespues"    TEXT,
  "areas"            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "contenido"        JSONB NOT NULL DEFAULT '{}'::jsonb,
  "propuesta"        JSONB,
  "test"             JSONB,
  "responsableEmail" TEXT,
  "creadaPor"        TEXT NOT NULL,
  "version"          INTEGER NOT NULL DEFAULT 0,
  "archivadaEn"      TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExploracionDeVenta_pkey" PRIMARY KEY ("id")
);

-- Una sola exploración VIVA por empresa; las archivadas no cuentan. Prisma no modela índices
-- parciales: vive solo acá, y el alta atrapa la carrera (P2002) devolviendo la que ya existe.
CREATE UNIQUE INDEX IF NOT EXISTS "ExploracionDeVenta_clientId_viva_key"
  ON "ExploracionDeVenta" ("clientId") WHERE "archivadaEn" IS NULL;

CREATE INDEX IF NOT EXISTS "ExploracionDeVenta_clientId_idx" ON "ExploracionDeVenta" ("clientId");
CREATE INDEX IF NOT EXISTS "ExploracionDeVenta_updatedAt_idx" ON "ExploracionDeVenta" ("updatedAt");

DO $$ BEGIN
  ALTER TABLE "ExploracionDeVenta" ADD CONSTRAINT "ExploracionDeVenta_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- La propuesta que salió de una exploración. Nullable: casi todas las propuestas no vienen de una.
ALTER TABLE "BusinessCase" ADD COLUMN IF NOT EXISTS "exploracionId" TEXT;

CREATE INDEX IF NOT EXISTS "BusinessCase_exploracionId_idx" ON "BusinessCase" ("exploracionId");

DO $$ BEGIN
  ALTER TABLE "BusinessCase" ADD CONSTRAINT "BusinessCase_exploracionId_fkey"
    FOREIGN KEY ("exploracionId") REFERENCES "ExploracionDeVenta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- OBLIGATORIO: Supabase le da SELECT a `anon` sobre todo `public`, y una exploración trae lo que
-- un prospecto contó de su negocio. RLS sin ninguna policy = nadie la lee con la clave pública;
-- Nexus entra con el rol del servidor, que no pasa por RLS.
ALTER TABLE "ExploracionDeVenta" ENABLE ROW LEVEL SECURITY;
