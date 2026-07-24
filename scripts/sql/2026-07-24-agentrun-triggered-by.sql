-- 2026-07-24 — Centro de corridas: avisarte solo de LO TUYO.
-- Columna nueva, nullable, sin default y sin backfill. DDL ADITIVO (seguro, no
-- destructivo). Aplicar a PROD ANTES de deployar el código (el repo no usa
-- prisma migrate; local == PROD).
--
--   triggeredByEmail — email del TeamMember que disparó la corrida. Las corridas de
--                      SISTEMA (watchdog CS, post-proceso de sesiones, clasificador)
--                      la dejan NULL y por construcción nunca generan aviso.
--
-- Las corridas históricas quedan NULL: no se le avisa a nadie de algo que ya pasó,
-- que es justo lo que se quiere.
--
-- Aplicar:  npx tsx -e '<pg client>'  contra :5432 directo (ver RUNBOOK), o psql.
-- Después:  npx prisma generate  +  deploy.

ALTER TABLE "AgentRun" ADD COLUMN IF NOT EXISTS "triggeredByEmail" TEXT;
