-- 2026-10-07 · La exploración del proyecto usa el lienzo de la preventa, y los adjuntos del «Contexto
-- adicional» quedan en los documentos de la empresa.
--
-- Pedido de Elías: copiar la exploración de la preventa a los proyectos, con las preguntas de Customer
-- Success (estrategia y escala), y que los archivos que se suben en cualquier «Contexto adicional»
-- (preventa o proyecto) queden en Información del cliente › Documentos, a nivel de empresa.
--
-- ADITIVO: 2 columnas en "ExploracionDeVenta", 1 en "ClientDocument", y el índice «una viva por
-- empresa» pasa a valer solo para la preventa (`projectId IS NULL`), con uno nuevo «una viva por
-- proyecto». Nada que backfillear: las 10 preventas vivas quedan con projectId NULL y marco 'venta'.
-- Re-ejecutable.
--
-- ⛔ ORDEN: esto va ANTES del deploy. El código nuevo filtra por "projectId" en toda lectura de
-- preventas y lee "ClientDocument"."origen"; si el deploy llega primero, la revisión de salud lo revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-07-exploracion-del-proyecto.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

-- ── La exploración de un proyecto ──────────────────────────────────────────────────────────────
ALTER TABLE "ExploracionDeVenta" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "ExploracionDeVenta" ADD COLUMN IF NOT EXISTS "marco" TEXT NOT NULL DEFAULT 'venta';

CREATE INDEX IF NOT EXISTS "ExploracionDeVenta_projectId_idx" ON "ExploracionDeVenta" ("projectId");

DO $$ BEGIN
  ALTER TABLE "ExploracionDeVenta" ADD CONSTRAINT "ExploracionDeVenta_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- «Una viva por empresa» era la regla de la preventa. Una empresa con preventa puede tener además la
-- exploración de cada proyecto, así que el índice pasa a mirar solo las filas sin proyecto. Se arma el
-- nuevo con otro nombre ANTES de soltar el viejo: nunca hay un rato sin la regla.
CREATE UNIQUE INDEX IF NOT EXISTS "ExploracionDeVenta_preventa_viva_key"
  ON "ExploracionDeVenta" ("clientId") WHERE "archivadaEn" IS NULL AND "projectId" IS NULL;
DROP INDEX IF EXISTS "ExploracionDeVenta_clientId_viva_key";

-- Una sola exploración VIVA por proyecto.
CREATE UNIQUE INDEX IF NOT EXISTS "ExploracionDeVenta_proyecto_viva_key"
  ON "ExploracionDeVenta" ("projectId") WHERE "archivadaEn" IS NULL AND "projectId" IS NOT NULL;

-- ── Desde qué «Contexto adicional» se subió un documento ───────────────────────────────────────
-- null = subido en Documentos. Con origen, su texto ya entra por esa pieza y el contexto general de
-- los agentes no lo vuelve a leer.
ALTER TABLE "ClientDocument" ADD COLUMN IF NOT EXISTS "origen" TEXT;

-- Verificación (db execute no muestra filas; correrla aparte si hace falta):
--   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'ExploracionDeVenta';
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'ClientDocument' AND column_name = 'origen';
