-- 2026-10-02 · Publicación del Diagnóstico y de la Planificación al cliente.
--
-- ADITIVA y nullable: los proyectos existentes quedan con NULL = no compartido. Sin backfill.
-- Mismo mecanismo que la Entrega (scripts/sql/2026-08-13-entrega-published.sql): el chokepoint de
-- acceso externo (lib/external/access.ts) lee las banderas de las superficies en el MISMO select.
--
-- Aplicar (En tu PC):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-02-diagnostico-planificacion-published.sql; Remove-Item Env:ALLOW_PROD_WRITE
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "diagnosticoPublishedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "planificacionPublishedAt" TIMESTAMP(3);
