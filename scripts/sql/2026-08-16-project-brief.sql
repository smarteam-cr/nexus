-- SQL #3 del plan «Los cuatro contextos» — el resumen citado de UN proyecto.
--
-- QUÉ HACE: crea la tabla "ProjectBrief". Es ADITIVO: no toca ninguna tabla existente, así que
-- se puede correr ANTES del deploy sin romper nada (el código viejo la ignora).
--
-- POR QUÉ EXISTE: espejo de "CsAccountBrief" un nivel más abajo. Aquél responde «cómo va la
-- CUENTA»; éste «cómo va ESTE proyecto» — la pregunta que el CSE se hace todos los días y que hoy
-- solo se contesta leyendo cinco pestañas. Acá viven los bloqueos y desalineaciones del eje 2 de
-- «los cuatro contextos», como afirmaciones CON su cita.
--
-- ⚠ POR SQL DIRECTO, NUNCA `prisma db push`. Después: `npx prisma generate` y REINICIAR el dev
-- server — saltarse el reinicio hace que las escrituras fallen en silencio.
--
--   npx prisma db execute --file scripts/sql/2026-08-16-project-brief.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "ProjectBrief" (
  "id"          TEXT         NOT NULL,
  "projectId"   TEXT         NOT NULL,
  "headline"    TEXT,
  "statements"  JSONB        NOT NULL,
  "agentRunId"  TEXT,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "staleAt"     TIMESTAMP(3),
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectBrief_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectBrief_projectId_key" ON "ProjectBrief"("projectId");

-- ON DELETE CASCADE: si el proyecto se borra, su resumen no tiene de qué hablar.
ALTER TABLE "ProjectBrief"
  DROP CONSTRAINT IF EXISTS "ProjectBrief_projectId_fkey";
ALTER TABLE "ProjectBrief"
  ADD CONSTRAINT "ProjectBrief_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
