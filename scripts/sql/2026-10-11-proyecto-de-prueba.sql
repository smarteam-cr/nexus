-- 2026-10-11 · Proyecto de prueba (docs/smartloop-plan.md, etapa 0).
--
-- Pedido de Elías: probar el módulo de servicios recurrentes con FACO dentro de Nexus, con datos
-- reales del cliente, y que se entienda que es de prueba. Un proyecto de prueba cuelga del cliente
-- real, no existe en HubSpot y queda fuera de la cartera, Cobranza, el vigía, «Para ti», el
-- clasificador de reuniones y la vista del cliente.
--
-- ADITIVO: 2 columnas. `esPrueba` NOT NULL DEFAULT false (todo lo que existe es real: no hay
-- backfill). `pruebaDeProjectId` nullable, sin FK (como `hermanoCsProjectId`).
--
-- ⛔ ORDEN: esto va ANTES del deploy. El código nuevo filtra por `esPrueba` en cada lista de
-- proyectos: si el deploy llega primero, /api/health responde 503 y deploy.sh revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-11-proyecto-de-prueba.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`. Se puede correr dos veces.

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "esPrueba" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "pruebaDeProjectId" TEXT;
