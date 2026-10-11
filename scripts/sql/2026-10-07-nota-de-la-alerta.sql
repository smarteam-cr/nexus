-- 2026-10-07 · Las alertas de Éxito del cliente se cierran con una nota corta.
--
-- Pedido de Elías: cada alerta se marca resuelta o descartada «con una nota corta opcional que
-- explique qué se hizo», y las cerradas se consultan después. Resolver y descartar ya existían
-- (`status`, `resolvedAt`, `resolvedByEmail`); faltaba dónde guardar qué se hizo.
--
-- ADITIVO: una columna nullable, sin backfill. NULL = se cerró sin nota.
--
-- ⛔ ORDEN: esto va ANTES del deploy. El código nuevo SELECCIONA la columna al leer las alertas:
-- si el deploy llega primero, revientan Éxito del cliente y la ficha de cada cuenta (y /api/health
-- responde 503, así que deploy.sh revierte).
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-07-nota-de-la-alerta.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.

ALTER TABLE "CsAlert" ADD COLUMN IF NOT EXISTS "resolutionNote" TEXT;
