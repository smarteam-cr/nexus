-- 2026-07-24 · ProjectCanvas.slug — IDENTIDAD estable de cada pieza
--
-- ADITIVO: 1 columna nullable + 1 índice + backfill. No borra ni renombra nada.
--
-- POR QUÉ: hasta ahora la identidad de una pieza era su NOMBRE VISIBLE
-- (`name = 'Desarrollo'`), repetido en 8+ lugares del código (mapa agente→canvas,
-- renderer propio, celda de permiso del artifact-gate, vista externa, contexto de
-- agentes, y hasta un filtro `name != 'Handoff'`). Renombrar rompía ruteo, render,
-- permisos y vista del cliente A LA VEZ, y dejaba huérfanos los canvases ya creados.
-- Con `slug` la identidad deja de depender del nombre: renombrar pasa a ser cambiar
-- un label en lib/pieces/registry.ts.
--
-- BACKFILL — dos reglas, y el orden importa:
--   1. Los canvases de BusinessCase se resuelven por `businessCaseId`, NO por nombre:
--      ahí `name` es la VERSIÓN ('Plantilla', 'Propuesta 1', 'Caso de uso 2'), no la
--      pieza. Si se fuera por nombre quedarían los 24 huérfanos.
--   2. El resto, por nombre, contra los `legacyNames` del registro.
-- Verificado antes de correr: los 790 canvases vivos resuelven, 0 huérfanos.
--
-- Los canvases CUSTOM del CSE quedan con slug NULL a propósito: no son una pieza
-- registrada, y `pieceForCanvas` devolver null para ellos es el comportamiento
-- correcto, no un error.
--
-- Cómo aplicarlo (revisá antes de correr):
--   npx prisma db execute --file scripts/sql/2026-07-24-projectcanvas-slug.sql
-- Después:
--   npx prisma generate   (NO `db:sync` — eso corre db push y la DB es compartida)

BEGIN;

ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- 1) Business Case PRIMERO: su nombre es la versión, no la pieza.
UPDATE "ProjectCanvas" SET "slug" = 'business-case'
 WHERE "businessCaseId" IS NOT NULL AND "slug" IS NULL;

-- 2) El resto, por nombre visible (legacyNames del registro).
UPDATE "ProjectCanvas" SET "slug" = CASE "name"
    WHEN 'Handoff'                 THEN 'handoff'
    WHEN 'Kickoff'                 THEN 'kickoff'
    WHEN 'Cronograma'              THEN 'timeline'
    WHEN 'Exploración'             THEN 'exploration'
    WHEN 'Diagnóstico'             THEN 'diagnosis'
    WHEN 'Planificación'           THEN 'planning'
    WHEN 'Desarrollo'              THEN 'tech-requirements'
    WHEN 'Información del cliente' THEN 'client-info'
  END
 WHERE "businessCaseId" IS NULL AND "slug" IS NULL;

-- Un canvas de proyecto solo puede tener UNA fila por pieza. Índice parcial: no
-- aplica al Business Case (versiona: N canvases con el mismo slug por definición)
-- ni a los custom (slug NULL).
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectCanvas_projectId_slug_key"
    ON "ProjectCanvas"("projectId", "slug")
    WHERE "projectId" IS NOT NULL AND "slug" IS NOT NULL;

COMMIT;

-- Verificación (esperado al 2026-07-24: 790 con slug, 0 sin resolver):
--   SELECT "slug", count(*) FROM "ProjectCanvas" GROUP BY 1 ORDER BY 2 DESC;
--   SELECT count(*) FROM "ProjectCanvas" WHERE "slug" IS NULL;  -- solo canvases custom
