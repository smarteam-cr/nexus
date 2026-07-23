-- 2026-07-22 — Handoff: exclusión por-ítem de engagements de HubSpot (la "X" de la columna
-- HubSpot del Contexto). DDL ADITIVO (seguro, no destructivo). Aplicar a mano a la Supabase de
-- PROD ANTES de deployar el código (la carpeta prisma/migrations está congelada; local == PROD).
--
-- Aplicar:  npx prisma db execute --file scripts/sql/2026-07-22-handoff-hubspot-exclusions.sql --schema prisma/schema.prisma
-- Después:  npx prisma generate  +  deploy.

-- AlterTable
ALTER TABLE "Handoff"
  ADD COLUMN "excludedEngagementIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
