-- 2026-10-07 · «Contexto adicional» propio del KICKOFF, la EXPLORACIÓN, INTEGRACIONES y la ENTREGA.
--
-- Pedido de Elías: «el contexto adicional debe ser para cada artefacto por separado: la misma
-- sección, pero guardarse para cada artefacto». Estos cuatro documentos no tenían el bloque. Arranca
-- SUGERIDO, como el del diagnóstico: toda reunión del proyecto con el cliente entra; el CSE saca o
-- agrega, y sacarla de uno no la saca de los otros.
--
-- ADITIVO: 4 columnas nullable. Las notas ya existen (`NotaDeContexto`, genérica por `pieza`) y las
-- instrucciones viven en el Json del canvas (entry `__doc`): no llevan SQL. NULL = «sigue la
-- sugerencia»; no hay backfill.
--
-- ⛔ ORDEN: esto va ANTES del deploy. El código nuevo SELECCIONA estas columnas en cada lectura de
-- vínculos sesión↔proyecto: si el deploy llega primero, revientan la ficha del cliente, el
-- cronograma y el clasificador (y /api/health responde 503, así que deploy.sh revierte).
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-07-contexto-de-cada-documento.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.

ALTER TABLE "SessionProject" ADD COLUMN IF NOT EXISTS "kickoffOverride" BOOLEAN;
ALTER TABLE "SessionProject" ADD COLUMN IF NOT EXISTS "explorationOverride" BOOLEAN;
ALTER TABLE "SessionProject" ADD COLUMN IF NOT EXISTS "techRequirementsOverride" BOOLEAN;
ALTER TABLE "SessionProject" ADD COLUMN IF NOT EXISTS "deliveryOverride" BOOLEAN;
