-- 2026-10-16 · Los sprints que lidera cada persona (fase 0.1 de docs/nexus-sistema-de-trabajo-plan.md).
--
-- ADITIVO y re-ejecutable. Va ANTES del deploy: el usuario se carga con su fila entera en cada página, así que el
-- código nuevo sin la columna revienta con P2022.
--
-- Hasta hoy el líder de un sprint era quien tenía `tareas.manage` en su override de /team, y valía solo en su área
-- (al 2026-10-16 nadie lo tenía). Ahora es un dato propio: una persona puede liderar más de un sprint.
--
-- Los primeros líderes, decididos por Elías el 2026-10-16:
--   · Alexander Vanegas (CSL): Customer Success y Desarrollo.
--   · Alejandra Ortega: Marketing (la líder del piloto de Tareas, docs/tareas-plan.md).
-- Solo se escriben si la persona todavía no tiene ninguno: correrlo dos veces no pisa lo que se eligió en Equipo.

ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "lideraEquipos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "TeamMember" SET "lideraEquipos" = ARRAY['cs', 'desarrollo']::TEXT[]
 WHERE lower(email) = 'avanegas@smarteamcr.com' AND cardinality("lideraEquipos") = 0;

UPDATE "TeamMember" SET "lideraEquipos" = ARRAY['marketing']::TEXT[]
 WHERE lower(email) = 'aortega@smarteamcr.com' AND cardinality("lideraEquipos") = 0;

-- Verificación: SELECT name, "lideraEquipos" FROM "TeamMember" WHERE cardinality("lideraEquipos") > 0;
