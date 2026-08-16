-- 2026-08-16 — De quién es una reunión: QUIÉN lo decidió y si fue una decisión o un efecto.
--
-- `FirefliesSession.manualClientId` lo escriben DOS gestos que en la base se ven idénticos:
--   1. alguien eligiendo el cliente a mano  (decisión)
--   2. la ADOPCIÓN automática al agregar una reunión huérfana a un proyecto  (efecto secundario)
--
-- Sin distinguirlos no se puede deshacer el segundo sin arriesgarse a pisar el primero. En un demo
-- una reunión desapareció del buscador para siempre por exactamente eso, y el rescate no existía
-- porque faltaba EL DATO, no el código.
--
-- ⚠ NO se backfillea nada: afirmar una procedencia que no se conoce sería peor que no saberla.
--    `manualClientSource IS NULL` = fila histórica = se trata como humana (no se auto-deshace).
--
-- ADITIVO y seguro de correr ANTES del deploy: el código viejo ignora las columnas nuevas.
--
--   npx prisma db execute --file scripts/sql/2026-08-16-duenio-manual-procedencia.sql --schema prisma/schema.prisma
--   npx prisma generate
--   ⚠ y REINICIAR el dev server: si no, el cliente de Prisma en memoria sigue sin las columnas y
--     las escrituras fallan con PrismaClientValidationError al navegar (ya pasó, 2026-07-30).

ALTER TABLE "FirefliesSession"
  ADD COLUMN IF NOT EXISTS "manualClientSource" TEXT,
  ADD COLUMN IF NOT EXISTS "manualClientBy"     TEXT,
  ADD COLUMN IF NOT EXISTS "manualClientAt"     TIMESTAMP(3);
