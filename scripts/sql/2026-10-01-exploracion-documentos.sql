-- 2026-10-01 · Exploraciones de venta: sesiones y documentos que el vendedor suma a mano.
--
-- Pedido de Elías (2026-10-01): no toda reunión queda grabada en Meet ni en HubSpot. El vendedor
-- pega el texto o sube un archivo (el resumen del Smartflow, una minuta, un correo largo) y el
-- agente lo lee igual que una transcripción: propone, el vendedor usa o descarta
-- (lib/exploraciones). Se guarda solo el TEXTO extraído, nunca el archivo.
--
-- ADITIVO: 1 tabla. Nada que backfillear.
-- Re-ejecutable: la base local re-aplica todos los SQL con fecha en cada bootstrap.
--
-- ⛔ ORDEN: esto va ANTES del deploy. El lienzo lista los documentos al abrirse; sin la tabla,
-- la revisión de salud del deploy lo revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-01-exploracion-documentos.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

CREATE TABLE IF NOT EXISTS "ExploracionDocumento" (
  "id"            TEXT NOT NULL,
  "exploracionId" TEXT NOT NULL,
  "titulo"        TEXT NOT NULL,
  "origen"        TEXT NOT NULL,
  "nombreArchivo" TEXT,
  "fecha"         TEXT,
  "texto"         TEXT NOT NULL,
  "creadoPor"     TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExploracionDocumento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ExploracionDocumento_exploracionId_idx" ON "ExploracionDocumento" ("exploracionId");

DO $$ BEGIN
  ALTER TABLE "ExploracionDocumento" ADD CONSTRAINT "ExploracionDocumento_exploracionId_fkey"
    FOREIGN KEY ("exploracionId") REFERENCES "ExploracionDeVenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- OBLIGATORIO: Supabase le da SELECT a `anon` sobre todo `public`, y un documento trae lo que un
-- prospecto contó de su negocio. RLS sin ninguna policy = nadie lo lee con la clave pública;
-- Nexus entra con el rol del servidor, que no pasa por RLS.
ALTER TABLE "ExploracionDocumento" ENABLE ROW LEVEL SECURITY;
