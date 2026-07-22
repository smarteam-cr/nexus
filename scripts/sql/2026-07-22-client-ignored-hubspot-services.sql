-- 2026-07-22 — Borrar proyecto en Nexus + desasociar de HubSpot: supresión durable de
-- re-sync. Cuando se borra un Project a mano, su hubspotServiceId se guarda acá para que
-- el sync (lib/hubspot/sync-projects.ts) NO lo vuelva a crear desde el objeto "Proyectos".
-- DDL ADITIVO (seguro, no destructivo). Aplicar a PROD ANTES de deployar el código.
--
-- Aplicar:  (vía pg contra :5432 directo — el datasource usa adapter, sin url en el schema)
-- Después:  npx prisma generate  +  deploy.

-- AlterTable
ALTER TABLE "Client"
  ADD COLUMN "ignoredHubspotServiceIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
