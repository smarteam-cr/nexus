-- SQL #2 del plan «Los cuatro contextos» — la sugerencia pendiente de estado y etapa.
--
-- QUÉ HACE: agrega ocho columnas a "Project", todas nullable. Es ADITIVO y no toca ni un dato
-- existente, así que se puede correr ANTES del deploy sin romper nada: el código viejo las ignora.
--
-- POR QUÉ EXISTEN: Elías pidió que Nexus proponga el estado y la etapa de cada proyecto y que se
-- manden a HubSpot con un clic. Estas columnas guardan la SUGERENCIA mientras espera decisión.
-- Aceptar NO las copia a `hubspotStatus`: escribe en HubSpot y el valor real vuelve por el espejo.
-- Molde: `healthProposed*`, que ya resuelve «el agente propone, el humano confirma».
--
-- ⚠ POR SQL DIRECTO, NUNCA `prisma db push` (droppearía columnas — regla del repo compartido).
-- Después: `npx prisma generate` y REINICIAR el dev server. Saltarse el reinicio hace que las
-- escrituras fallen en silencio con un cliente de Prisma viejo en memoria.
--
--   npx prisma db execute --file scripts/sql/2026-08-16-estado-y-etapa-propuestos.sql

ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "estadoPropuesto"        TEXT,
  ADD COLUMN IF NOT EXISTS "estadoPropuestoMotivo"  TEXT,
  ADD COLUMN IF NOT EXISTS "estadoPropuestoAt"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "estadoPropuestoByRunId" TEXT,
  ADD COLUMN IF NOT EXISTS "etapaPropuestaStageId"  TEXT,
  ADD COLUMN IF NOT EXISTS "etapaPropuestaMotivo"   TEXT,
  ADD COLUMN IF NOT EXISTS "etapaPropuestaAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "etapaPropuestaByRunId"  TEXT;
