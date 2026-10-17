-- 2026-10-16 · La lista de limpieza de HubSpot (fase 0.5 de docs/nexus-sistema-de-trabajo-plan.md).
--
-- ADITIVO y re-ejecutable. Va ANTES del deploy: el proyecto se lee con su fila entera en muchas pantallas, así que el
-- código nuevo sin las columnas revienta con P2022.
--
-- Dos datos que el espejo de proyectos copia de HubSpot (lib/hubspot/sync-projects.ts) para saber qué está quieto:
--   · "hubspotEtapaDesde"      = hs_v2_date_entered_current_stage: desde cuándo el proyecto está en la etapa de hoy;
--   · "hubspotUltimaActividad" = hs_last_activity_date: la última actividad registrada en el proyecto.
-- Nacen vacías y se llenan con la siguiente sincronización de cada cliente.

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "hubspotEtapaDesde" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "hubspotUltimaActividad" TIMESTAMP(3);
