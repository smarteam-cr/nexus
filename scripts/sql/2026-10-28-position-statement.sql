-- 2026-10-28 · El position statement de Smarteam con sus frentes (K3 y pregunta 12 del roadmap).
--
-- POR QUÉ. Elías escribió el 28 oct el position statement de Smarteam: una frase y tres frentes (Estructura · HubSpot,
-- Activación · Insider One, Acompañamiento), cada uno con «qué logra» y «cuándo cabe». Se edita en Marketing › Audiencia
-- y la preventa lo personaliza y lo valida contra él. La frase sigue en "positionStatement"; los frentes van acá.
-- Plan: docs/position-statement-plan.md.
--
-- QUÉ ENTRA (ADITIVO: nada se dropea ni se renombra; se puede correr dos veces).
--   "PerfilDeLaEmpresa"."frentes": los frentes del position statement, en Json (lib/smarteam/posicionamiento.ts).
--
-- ⚠ ORDEN: ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce la columna) y el deploy se
-- revierte solo. Después: scripts/cargar-position-statement.ts (simulacro, y --apply con ALLOW_PROD_WRITE=1).
--
-- Volver atrás (borra los frentes; con revisión):
--   ALTER TABLE "PerfilDeLaEmpresa" DROP COLUMN IF EXISTS "frentes";

ALTER TABLE "PerfilDeLaEmpresa" ADD COLUMN IF NOT EXISTS "frentes" JSONB NOT NULL DEFAULT '[]';
