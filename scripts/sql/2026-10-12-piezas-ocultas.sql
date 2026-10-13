-- 2026-10-12 · Piezas ocultas del riel de un proyecto (pedido de Elías).
--
-- El equipo puede ocultar artefactos del riel de la ficha (en una implementación y en un servicio
-- recurrente). No se borra nada ni se apaga la pieza: quedan plegadas en «Ver N piezas más».
-- Se guarda por proyecto, con los slugs de las piezas.
--
-- ADITIVO: 1 columna con default. Sin tabla nueva (Project ya tiene RLS).
--
-- ⛔ ORDEN: esto va ANTES del deploy. /api/health responde 503 sin la columna y deploy.sh revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-12-piezas-ocultas.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`. Se puede correr dos veces.

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "piezasOcultas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
