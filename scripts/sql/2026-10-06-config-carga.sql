-- 2026-10-06 · Los supuestos de la carga de Customer Success
--
-- Pedido de Elías (2026-10-05): medir la carga de cada CSE para la 1:1 de Alex Vanegas y saber cuándo contratar. Nexus
-- ve las reuniones y el plan, pero no el trabajo fuera de las reuniones: hasta medirlo, se ESTIMA con supuestos que la
-- CSL y dirección ajustan en «Cómo se calcula la carga» (lib/carga/config.ts). Una fila por guardado: la más reciente
-- manda y las anteriores son la historia de quién cambió qué y cuándo. Sin filas, rigen los valores de fábrica.
--
-- ADITIVO: una tabla nueva, sin tocar nada existente. Re-ejecutable.
--
-- ⛔ ORDEN: esto va ANTES del deploy del código que trae el modelo `ConfigCarga`: sin la tabla, /api/health responde
-- 503 y el deploy se revierte solo.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-06-config-carga.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

BEGIN;

CREATE TABLE IF NOT EXISTS "ConfigCarga" (
  "id"        TEXT NOT NULL,
  "valores"   JSONB NOT NULL,
  "motivo"    TEXT,
  "creadoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConfigCarga_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ConfigCarga_createdAt_idx" ON "ConfigCarga"("createdAt");

-- Interna: nadie la lee con la clave pública.
ALTER TABLE "ConfigCarga" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "ConfigCarga";
CREATE POLICY deny_all_non_superuser ON "ConfigCarga" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

COMMIT;
