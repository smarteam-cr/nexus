-- 2026-07-29 · Proyectos multi-pipeline: de qué CLASE es cada proyecto
--
-- ADITIVO: 4 columnas en "Project" + 2 índices. No borra ni renombra nada. Ninguna
-- columna existente cambia de tipo ni de default.
--
-- El "tipo" de proyecto NO se guarda: se DERIVA de `hubspotPipelineId` a través del
-- registro `lib/projects/kind.ts`. Se guarda el hecho crudo porque los pipelines se
-- crean en HubSpot cualquier tarde y un enum de Postgres no puede guardar uno
-- desconocido (ni soltar un valor sin cirugía).
--
-- Cómo aplicarlo (revisá antes de correr):
--   npx prisma db execute --file scripts/sql/2026-07-29-proyectos-multipipeline.sql
-- Después:
--   npx prisma generate      (NO `db:sync` — eso corre db push y DROPPEA columnas)
--   reiniciar el dev server  (el Prisma client viejo no conoce las columnas)
--
-- ⚠ ORDEN ESTRICTO para producción: este SQL → deploy de la imagen → backfill.
--   El código tolera `hubspotPipelineId` en NULL (degrada al comportamiento legacy de
--   Customer Success), así que la ventana entre los tres pasos es inocua.
--
-- ── CONSTANCIA DEL DATO DESTRUIDO (leído del portal el 2026-07-29) ────────────
--   Proyectos en el objeto 0-970 ....................... 70
--     · con `proyecto_interno` = true ................... 0
--     · con `proyecto_interno` = false explícito ........ 0
--     · con `proyecto_interno` VACÍO .................... 70
--   Un checkbox sin marcar en HubSpot llega VACÍO, no "false". Desde que esta migración
--   aplica el default, "false" y "nunca leído" quedan indistinguibles PARA SIEMPRE. Se
--   acepta porque el default de negocio también es "no interno" y porque el conteo de
--   arriba queda escrito acá: si alguien duda en seis meses, la respuesta es que en el
--   momento de aplicar no había ni un solo proyecto marcado.

BEGIN;

-- De qué pipeline de HubSpot viene. Es la CLAVE de la tabla de decisiones.
-- NULL = sin backfill todavía, o un pipeline que nadie declaró en el registro. Los dos
-- casos degradan a legacy (= Customer Success), que es lo que hace invisible el deploy.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "hubspotPipelineId" TEXT;

-- Propiedad `proyecto_interno` (booleancheckbox). Apaga cobranza, cartera y publicación.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "proyectoInterno" BOOLEAN NOT NULL DEFAULT false;

-- El HECHO de la asociación proyecto↔proyecto (typeId 1254), en ids de HubSpot. Se guarda
-- aunque el otro proyecto todavía no exista en Nexus: así el orden de llegada no importa.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "hubspotRelatedProjectIds" TEXT[] NOT NULL DEFAULT '{}';

-- La RESOLUCIÓN de lo anterior: el Project.id del hermano de Customer Success. Escalar sin
-- FK a propósito — un id huérfano degrada a "proyecto aparte" en vez de romper un borrado.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "hermanoCsProjectId" TEXT;

-- Índices: los dos se usan en filtros de listado (cartera, cobranza, rail de proyectos).
CREATE INDEX IF NOT EXISTS "Project_hubspotPipelineId_idx" ON "Project" ("hubspotPipelineId");
CREATE INDEX IF NOT EXISTS "Project_hermanoCsProjectId_idx" ON "Project" ("hermanoCsProjectId");

-- BACKFILL tramo 1 (barato y sin HubSpot): los que YA tienen el nombre del pipeline
-- resuelto por el sync. Cubre a la enorme mayoría sin una sola llamada a la API.
-- El resto lo completa `scripts/backfill-project-pipeline.ts` (dry-run primero).
UPDATE "Project" SET "hubspotPipelineId" = '826270797'
  WHERE "hubspotPipelineId" IS NULL AND "hubspotPipelineName" = 'Customer Success CRM';
UPDATE "Project" SET "hubspotPipelineId" = '922785384'
  WHERE "hubspotPipelineId" IS NULL AND "hubspotPipelineName" = 'Development';
UPDATE "Project" SET "hubspotPipelineId" = '922688687'
  WHERE "hubspotPipelineId" IS NULL AND "hubspotPipelineName" = 'Sitios web';

COMMIT;

-- ── Verificación ─────────────────────────────────────────────────────────────
-- 1) Las 4 columnas existen:
--    SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--      WHERE table_name = 'Project'
--        AND column_name IN ('hubspotPipelineId','proyectoInterno','hubspotRelatedProjectIds','hermanoCsProjectId')
--      ORDER BY column_name;
--
-- 2) Qué cubrió el tramo 1 y cuánto queda para el script (los NULL son los que tienen
--    hubspotServiceId pero nunca resolvieron el nombre del pipeline):
--    SELECT "hubspotPipelineId", count(*) FROM "Project" GROUP BY 1 ORDER BY 2 DESC;
--    SELECT count(*) FROM "Project" WHERE "hubspotServiceId" IS NOT NULL AND "hubspotPipelineId" IS NULL;
--
-- 3) Nadie quedó marcado interno por accidente (tiene que dar 0 — lo marca una persona
--    en HubSpot, nunca esta migración):
--    SELECT count(*) FROM "Project" WHERE "proyectoInterno" = true;
--
-- 4) Ningún hermano quedó escrito todavía (esta migración no lo calcula; lo hace el sync):
--    SELECT count(*) FROM "Project" WHERE "hermanoCsProjectId" IS NOT NULL;
