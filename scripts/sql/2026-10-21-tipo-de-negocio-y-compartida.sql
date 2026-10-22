-- 2026-10-21 · Qué es cada negocio ganado y con quién se compartió
--
-- El modelo de comisiones cerrado con Marco (DECISIONS «El modelo de comisiones cerrado con Marco») necesita saber de
-- cada negocio ganado si es cliente nuevo, expansión o renovación, y si se compartió entre Ventas y Customer Success:
--   · `VentaGanada.tipoDeNegocio`: sale de la propiedad de trato `motion_comercial` de HubSpot (Recuperación = NUEVO).
--     null = nadie lo marcó, y la simulación lo deduce.
--   · `VentaGanada.compartidaConHubspotOwnerId` + `compartidaConId`: el valor que tenía «Venta compartida con»
--     (`venta_compartida_con`) al entrar a ganado, y la persona de Nexus que le corresponde.
--   · `VentaGanada.compartidaDespuesDeLaFirma`: la marca se puso o cambió después de la firma; no vale.
-- Los completa la copia de negocios ganados (lib/ventas/sync-ganadas.ts) en su próxima corrida.
--
-- ADITIVO: un tipo nuevo y cuatro columnas (nullable o con default). Re-ejecutable.
--
-- ⛔ ORDEN: esto va ANTES del deploy del código que trae las columnas: sin ellas, /api/health responde 503 y el deploy
-- se revierte solo.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-21-tipo-de-negocio-y-compartida.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TipoDeNegocio') THEN
    CREATE TYPE "TipoDeNegocio" AS ENUM ('NUEVO', 'EXPANSION', 'RENOVACION');
  END IF;
END $$;

ALTER TABLE "VentaGanada" ADD COLUMN IF NOT EXISTS "tipoDeNegocio" "TipoDeNegocio";
ALTER TABLE "VentaGanada" ADD COLUMN IF NOT EXISTS "compartidaConHubspotOwnerId" TEXT;
ALTER TABLE "VentaGanada" ADD COLUMN IF NOT EXISTS "compartidaConId" TEXT;
ALTER TABLE "VentaGanada" ADD COLUMN IF NOT EXISTS "compartidaDespuesDeLaFirma" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VentaGanada_compartidaConId_fkey') THEN
    ALTER TABLE "VentaGanada"
      ADD CONSTRAINT "VentaGanada_compartidaConId_fkey"
      FOREIGN KEY ("compartidaConId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "VentaGanada_compartidaConId_idx" ON "VentaGanada"("compartidaConId");

COMMIT;
