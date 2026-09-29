-- 2026-09-28 · Versiones de los documentos: una foto antes de que la IA reescriba un documento.
--
-- Pedido de Elías: regenerar un diagnóstico viejo borraba su Escala (el punto de partida que lee la
-- Entrega), sus causas y sus recomendaciones, sin histórico. Con esto se pueden consultar versiones
-- anteriores, traer una sección al documento actual o restaurarlo entero. Vale para TODOS los
-- documentos que la IA regenera (lib/canvas/versiones.ts).
--
-- ADITIVO: 1 tabla. Nada se toca ni se backfillea acá; el respaldo inicial de los documentos que ya
-- existen lo toma `scripts/respaldar-documentos.ts`, DESPUÉS de este SQL.
--
-- ⛔ ORDEN: esto va ANTES del deploy. Los runners guardan la foto antes de escribir: sin la tabla, la
-- foto falla — el runner lo tolera y sigue, pero regenerar volvería a pisar sin histórico.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-09-28-versiones-de-documento.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.

CREATE TABLE IF NOT EXISTS "VersionDeDocumento" (
  "id"        TEXT NOT NULL,
  "canvasId"  TEXT NOT NULL,
  "pieza"     TEXT,
  "origen"    TEXT NOT NULL,
  "creadaPor" TEXT,
  "huella"    TEXT NOT NULL,
  "secciones" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VersionDeDocumento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VersionDeDocumento_canvasId_createdAt_idx"
  ON "VersionDeDocumento" ("canvasId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "VersionDeDocumento" ADD CONSTRAINT "VersionDeDocumento_canvasId_fkey"
    FOREIGN KEY ("canvasId") REFERENCES "ProjectCanvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- OBLIGATORIO: Supabase le da SELECT a `anon` sobre todo `public`, y una foto trae el documento
-- entero del cliente. RLS sin ninguna policy = nadie la lee con la clave pública; Nexus entra con el
-- rol del servidor, que no pasa por RLS.
ALTER TABLE "VersionDeDocumento" ENABLE ROW LEVEL SECURITY;
