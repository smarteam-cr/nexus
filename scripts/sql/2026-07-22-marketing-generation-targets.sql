-- 2026-07-22 — Contenido/redes: generación a medida (objetivo de piezas por tanda).
-- DDL ADITIVO (seguro, no destructivo). Aplicar a mano a la Supabase de PROD ANTES de deployar
-- el código (la carpeta prisma/migrations está congelada; local == PROD, ver invariante #3).
--
-- Aplicar:  npx prisma db execute --file scripts/sql/2026-07-22-marketing-generation-targets.sql --schema prisma/schema.prisma
-- Después:  npx prisma generate  +  reiniciar el dev server.
--
-- Va ACOPLADO con 2026-07-21-marketing-post-attribution.sql (el eje EMPRESA/PERSONA del que
-- depende esta feature): aplicar ambos. Verificado con `prisma migrate diff` = estos statements,
-- sin drift ajeno.

-- AlterTable
ALTER TABLE "MarketingSettings"
  ADD COLUMN "genEmpresaTarget" INTEGER NOT NULL DEFAULT 9,
  ADD COLUMN "genPersonaTarget" INTEGER NOT NULL DEFAULT 6;
