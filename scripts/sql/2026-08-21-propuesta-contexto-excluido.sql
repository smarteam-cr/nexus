-- 2026-08-21 · La "X" del contexto de HubSpot, ahora también en las propuestas
--
-- Espejo exacto de `Handoff.excludedEngagementIds` (que ya existe para proyectos): los
-- engagements de HubSpot que Ventas saca a mano del contexto de UNA propuesta para que no
-- alimenten la generación. Por propuesta y no por cliente — un prospecto puede tener varias
-- vivas y podar una no puede podar las otras.
--
-- ADITIVA e inocua: default '{}' = nada excluido = el comportamiento de hoy, así que el
-- código viejo sigue corriendo igual mientras esta columna existe sin que nadie la lea.

ALTER TABLE "BusinessCase"
  ADD COLUMN IF NOT EXISTS "excludedEngagementIds" TEXT[] NOT NULL DEFAULT '{}';
