-- 2026-10-09 · Éxito del cliente: la categoría de alerta «Queja del cliente»
--
-- Entrega 2 de docs/exito-del-cliente-cartera-plan.md: el agente vigía levanta una «Queja del cliente» cuando el
-- cliente se queja en una reunión o en un correo, con la frase literal. Verificada contra la reunión o el correo,
-- pinta el color de la cuenta (amarillo; rojo si es grave o la cuenta renueva en 90 días o menos).
--
-- Un solo `ADD VALUE`, al final del enum y solo: Postgres 12 o más lo corre en una transacción mientras el valor
-- nuevo no se use en ella, y acá no se usa. Agregar un valor que nadie usa todavía es inocuo para el código viejo.
--
-- ⛔ ORDEN: ANTES del deploy. Con el código nuevo y sin el valor, /api/health responde 503 (el cliente Prisma lo
-- espera) y el deploy se revierte solo.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-09-queja-del-cliente.sql
--
-- Si la base respondiera «cannot run inside a transaction block», es la excepción documentada en ARCHITECTURE
-- Parte 0 · cap. D: el mismo comando en un one-liner `npx tsx -e` que llama a `assertProdWriteAllowed()` primero.
-- NUNCA `prisma db push`. Después: `npx prisma generate` y reiniciar el dev server.

ALTER TYPE "CsAlertCategory" ADD VALUE IF NOT EXISTS 'QUEJA';
