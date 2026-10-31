-- 2026-10-30 · Herramientas del proyecto con varias copias (Elías, 30 oct, tras probar en el 3005).
--
-- Exploración y Cuestionarios se crean varias veces en un proyecto, cada uno con su nombre, igual que los entregables.
-- Una COPIA es una fila de "ProjectCanvas" sin slug (scripts/sql/2026-10-29-artefactos-copias.sql); lo que ella guarda
-- vive donde vivió siempre, con su "canvasId":
--   · "ExploracionDeVenta"."canvasId": la exploración de esa copia. null = la de siempre del proyecto.
--   · "Cuestionario"."canvasId": el cuestionario de esa copia. null = los de siempre del proyecto.
-- Re-ejecutable.
--
-- ⛔ ORDEN: esto va ANTES del deploy. El código nuevo lee las dos columnas; sin ellas, /api/health responde 503 y el
-- deploy se revierte solo. El código viejo no las mira y sigue igual mientras no haya copias.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-30-herramientas-con-copias.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

-- ── La exploración de una copia ────────────────────────────────────────────────────────────────
ALTER TABLE "ExploracionDeVenta" ADD COLUMN IF NOT EXISTS "canvasId" TEXT;
CREATE INDEX IF NOT EXISTS "ExploracionDeVenta_canvasId_idx" ON "ExploracionDeVenta" ("canvasId");

DO $$ BEGIN
  ALTER TABLE "ExploracionDeVenta" ADD CONSTRAINT "ExploracionDeVenta_canvasId_fkey"
    FOREIGN KEY ("canvasId") REFERENCES "ProjectCanvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- «Una viva por proyecto» pasa a ser «una viva de siempre por proyecto y una viva por copia». Se arman los nuevos con
-- otro nombre ANTES de soltar el viejo: nunca hay un rato sin la regla.
CREATE UNIQUE INDEX IF NOT EXISTS "ExploracionDeVenta_proyecto_de_siempre_viva_key"
  ON "ExploracionDeVenta" ("projectId") WHERE "archivadaEn" IS NULL AND "projectId" IS NOT NULL AND "canvasId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "ExploracionDeVenta_copia_viva_key"
  ON "ExploracionDeVenta" ("canvasId") WHERE "archivadaEn" IS NULL AND "canvasId" IS NOT NULL;
DROP INDEX IF EXISTS "ExploracionDeVenta_proyecto_viva_key";

-- ── Los cuestionarios de una copia ─────────────────────────────────────────────────────────────
ALTER TABLE "Cuestionario" ADD COLUMN IF NOT EXISTS "canvasId" TEXT;
CREATE INDEX IF NOT EXISTS "Cuestionario_canvasId_idx" ON "Cuestionario" ("canvasId");

DO $$ BEGIN
  ALTER TABLE "Cuestionario" ADD CONSTRAINT "Cuestionario_canvasId_fkey"
    FOREIGN KEY ("canvasId") REFERENCES "ProjectCanvas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Verificación (db execute no muestra filas; correrla aparte si hace falta):
--   SELECT indexname FROM pg_indexes WHERE tablename = 'ExploracionDeVenta';
--   SELECT column_name FROM information_schema.columns WHERE table_name IN ('ExploracionDeVenta', 'Cuestionario') AND column_name = 'canvasId';
