-- 2026-09-29 · «Contexto» propio de la PLANIFICACIÓN y la EJECUCIÓN.
--
-- Pedido de Elías: el mismo espacio de contexto que ya tienen el cronograma y el diagnóstico — qué
-- reuniones alimentan cada documento y notas propias. Arranca SUGERIDO, como el del diagnóstico:
-- toda reunión del proyecto con el cliente entra; el CSE saca o agrega.
--
-- ADITIVO: 2 columnas nullable. Las notas ya existen (`NotaDeContexto`, genérica por `pieza`, del
-- 2026-09-28). NULL = «sigue la sugerencia»; no hay backfill.
--
-- ⛔ ORDEN: esto va ANTES del deploy. El código nuevo SELECCIONA estas columnas en cada lectura de
-- vínculos sesión↔proyecto: si el deploy llega primero, revientan la ficha del cliente, el
-- cronograma y el clasificador (INV7).
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-09-29-contexto-planificacion-ejecucion.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.

ALTER TABLE "SessionProject" ADD COLUMN IF NOT EXISTS "planningOverride" BOOLEAN;
ALTER TABLE "SessionProject" ADD COLUMN IF NOT EXISTS "implementationOverride" BOOLEAN;
