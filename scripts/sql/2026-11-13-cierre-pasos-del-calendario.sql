-- 2026-11-13 · Los pasos del calendario en el cierre del mes (pedido de Finanzas 23).
--
-- El checklist del cierre suma el calendario de Finanzas: del 1 al 5 la facturación y el cierre del IVA, Odoo y
-- Mercury al día; el 5 los balances y el reporte del IVA; los días 10 y 25 las reuniones de gerencia. No se pueden
-- medir solos: quien supervisa los marca como hechos, y queda quién y cuándo. No frenan el cierre.
--
-- ADITIVO: 1 columna JSONB nullable en una tabla que ya tiene RLS. null = ningún paso marcado.
-- Forma: { "<clave del paso>": { "por": "<email>", "en": "<ISO>" } }.
--
-- ⛔ ORDEN: esto va ANTES del deploy. /api/health responde 503 sin la columna y deploy.sh revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-11-13-cierre-pasos-del-calendario.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`. Se puede correr dos veces.

ALTER TABLE "CierreMes" ADD COLUMN IF NOT EXISTS "pasosDelCalendario" JSONB;
