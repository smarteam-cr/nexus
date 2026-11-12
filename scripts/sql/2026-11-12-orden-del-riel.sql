-- 2026-11-12 · El orden de la lista de artefactos de un proyecto (Elías: arrastrar en la lista).
--
-- Al pasar el mouse por un artefacto de la lista aparece un asa para arrastrarlo: se ordena adentro de
-- «Entregables» y adentro de «Herramientas», mezclando tipos. El orden es del proyecto (lo ven todos igual)
-- y se guarda con las claves de las filas (`kickoff`, `copia:<id>`…).
--
-- ADITIVO: 1 columna con default. Sin tabla nueva (Project ya tiene RLS).
--
-- ⛔ ORDEN: esto va ANTES del deploy. /api/health responde 503 sin la columna y deploy.sh revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-11-12-orden-del-riel.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`. Se puede correr dos veces.

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "ordenDelRiel" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
