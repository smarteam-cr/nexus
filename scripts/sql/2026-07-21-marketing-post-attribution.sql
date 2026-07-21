-- 2026-07-21 — Optimización de Contenido/redes: tipo de post + guía semanal + atribución.
-- DDL ADITIVO (seguro, no destructivo). Aplicar a mano a la Supabase de PROD ANTES de deployar
-- el código (la carpeta prisma/migrations está congelada; local == PROD, ver invariante #3).
--
-- Aplicar:  npx prisma db execute --file scripts/sql/2026-07-21-marketing-post-attribution.sql --schema prisma/schema.prisma
-- Después:  npx prisma generate  (ya corrido localmente)  +  reiniciar el dev server.
--
-- Verificado con `prisma migrate diff` = exactamente estos statements, sin drift ajeno.

-- CreateEnum
CREATE TYPE "MarketingPostType" AS ENUM ('EMPRESA', 'PERSONA');

-- CreateEnum
CREATE TYPE "MarketingJourneyStage" AS ENUM ('CONCIENCIA', 'ESTRATEGIA', 'INSPIRACION');

-- CreateEnum
CREATE TYPE "MarketingUsageTarget" AS ENUM ('PERSONAL', 'SMARTEAM');

-- AlterTable
ALTER TABLE "ContentIdea" ADD COLUMN     "acceptedByEmail" TEXT,
ADD COLUMN     "acceptedFor" "MarketingUsageTarget",
ADD COLUMN     "journeyStage" "MarketingJourneyStage",
ADD COLUMN     "postType" "MarketingPostType" NOT NULL DEFAULT 'EMPRESA';
