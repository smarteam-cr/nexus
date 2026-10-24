-- 2026-10-24 · R7: la dueña de cada reunión pasa a ser una llave de verdad.
--
-- POR QUÉ. `FirefliesSession.resolvedClientId` es LA fuente de «de quién es la reunión» (invariante 1 de CLAUDE.md), y
-- `manualClientId` su override humano; ninguna de las dos era una llave foránea, así que la base no impedía que
-- apuntaran a una empresa borrada. Pasó: una reunión escondida en un demo en vivo el 2026-08-04 (ver el DELETE de
-- app/api/clients/[id]/route.ts), y el 24 oct había 1 `manualClientId` apuntando a una empresa que ya no existe.
-- Decisión completa: docs/DECISIONS.md › «Las llaves de la empresa: la dueña de la reunión y la empresa de HubSpot».
-- Volver único `Client.hubspotCompanyId` es R7b, aparte: hoy siete caminos pueden repetir el id.
--
-- QUÉ ENTRA.
--   1. La reunión que apunta a una empresa borrada vuelve a «sin dueño manual» (es el estado honesto, lo mismo que
--      hace el DELETE de una empresa). Solo toca filas huérfanas: en una base sana no cambia nada.
--   2. `resolvedClientId` → llave a "Client" con RESTRICT: borrar una empresa con reuniones es un error visible, nunca
--      reuniones sin dueño en silencio. El DELETE y la fusión ya sueltan o mudan las reuniones antes de borrar.
--   3. `manualClientId` → llave a "Client" con SET NULL: si la empresa se borra, el override se cae solo.
--
-- Se puede correr dos veces. Si hubiera una reunión con `resolvedClientId` huérfano, el ALTER falla entero y no cambia
-- nada (el 24 oct había 0).
--
-- Volver atrás:
--   ALTER TABLE "FirefliesSession" DROP CONSTRAINT IF EXISTS "FirefliesSession_resolvedClientId_fkey";
--   ALTER TABLE "FirefliesSession" DROP CONSTRAINT IF EXISTS "FirefliesSession_manualClientId_fkey";
--
-- Aplicación:
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-10-24-llaves-de-la-empresa.sql
--   npx prisma generate   ·   npm run check:invariants (INV48)

UPDATE "FirefliesSession" s
   SET "manualClientId" = NULL
 WHERE s."manualClientId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "Client" c WHERE c."id" = s."manualClientId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FirefliesSession_resolvedClientId_fkey') THEN
    ALTER TABLE "FirefliesSession"
      ADD CONSTRAINT "FirefliesSession_resolvedClientId_fkey"
      FOREIGN KEY ("resolvedClientId") REFERENCES "Client"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FirefliesSession_manualClientId_fkey') THEN
    ALTER TABLE "FirefliesSession"
      ADD CONSTRAINT "FirefliesSession_manualClientId_fkey"
      FOREIGN KEY ("manualClientId") REFERENCES "Client"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
