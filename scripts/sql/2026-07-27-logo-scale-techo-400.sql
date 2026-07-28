-- 2026-07-27 · Client.logoScale: el techo sube de 200% a 400%
--
-- Solo reemplaza el CHECK de rango. No toca datos, no toca columnas.
--
-- POR QUÉ: el tamaño del logo está atado SOLO al alto, y eso achica sistemáticamente a
-- los logos CUADRADOS. Medido sobre los 12 archivos cargados hoy:
--
--     forma          ancho a 30px de alto    presencia visual
--     cuadrado 1:1            30px                 20%
--     banda 3,4:1            102px                 68%
--     banda 6,2:1            187px                125%
--
-- 3 de los 12 son cuadrados. Para que un cuadrado iguale el ancho de una banda típica
-- (102px) necesita alto 102 = 340%, que el techo de 200 ni siquiera dejaba PEDIR.
--
-- Bajar el CHECK no es opción: es la red contra una escritura directa por SQL (un 5000
-- taparía el documento entero en una propuesta que el cliente está mirando). Se corre
-- hacia arriba, no se saca.
--
-- ⚠ SE APLICA A MANO, NUNCA con `db push` / `db:sync`.
--
-- Cómo aplicarlo:
--   npx prisma db execute --file scripts/sql/2026-07-27-logo-scale-techo-400.sql
-- No hace falta `prisma generate`: el tipo de la columna no cambia (sigue INTEGER).

BEGIN;

ALTER TABLE "Client" DROP CONSTRAINT IF EXISTS "Client_logoScale_rango";
ALTER TABLE "Client"
  ADD CONSTRAINT "Client_logoScale_rango"
  CHECK ("logoScale" IS NULL OR ("logoScale" >= 50 AND "logoScale" <= 400));

COMMIT;

-- Verificación (debe imprimir el rango 50..400):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'Client_logoScale_rango';
