-- 2026-07-22 — Avisos manuales bajo el cronograma: nuevo tipo AVISO (nota libre del CSE al
-- cliente que NO mueve fechas). DDL ADITIVO (seguro, no destructivo). Aplicar a PROD ANTES de
-- deployar el código (el repo no usa prisma migrate; local == PROD).
--
-- ⚠ `ALTER TYPE ... ADD VALUE` no corre dentro de una transacción y el valor nuevo no es usable
-- en la misma transacción que lo agrega → se aplica suelto, antes del deploy.
--
-- Aplicar:  npx tsx -e '<pg client>'  contra :5432 directo (ver RUNBOOK), o psql.
-- Después:  npx prisma generate  +  deploy.

ALTER TYPE "ParticularidadKind" ADD VALUE IF NOT EXISTS 'AVISO';
