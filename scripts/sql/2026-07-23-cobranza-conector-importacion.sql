-- 2026-07-23 — Carga del histórico de facturación 2026 (hoja de Alex → módulo de cobranza).
-- Dos valores de enum nuevos. DDL ADITIVO (seguro, no destructivo). Aplicar a PROD ANTES de
-- deployar el código (el repo no usa prisma migrate; local == PROD).
--
--   CONECTOR    — tipo de servicio real que hoy no existe: integraciones SaaS facturadas
--                 aparte (Hub&SAP, QuickBooks), hoja "Conectores SAAS" del documento.
--   IMPORTACION — procedencia del cobro: distingue lo cargado del histórico de lo creado
--                 a mano en el panel y de lo materializado por el engine.
--
-- ⚠ `ALTER TYPE ... ADD VALUE` no corre dentro de una transacción y el valor nuevo no es usable
-- en la misma transacción que lo agrega → se aplica suelto, antes del deploy.
--
-- Aplicar:  npx tsx -e '<pg client>'  contra :5432 directo (ver RUNBOOK), o psql.
-- Después:  npx prisma generate  +  deploy.

ALTER TYPE "CobranzaTipoServicio" ADD VALUE IF NOT EXISTS 'CONECTOR';
ALTER TYPE "CobranzaOrigenCobro" ADD VALUE IF NOT EXISTS 'IMPORTACION';
