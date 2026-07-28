-- 2026-07-24 · ClientKind (qué es cada empresa) + TAM en USD
--
-- ADITIVO: 1 enum + 2 columnas. No borra nada — `isProspect` se queda como columna
-- DEPRECATED (ver el comentario del schema) para poder auditar el backfill.
--
-- Cómo aplicarlo (revisá antes de correr):
--   npx prisma db execute --file scripts/sql/2026-07-24-client-kind-y-tam.sql
-- Después:
--   npx prisma generate    (NO `db:sync` — eso corre db push)
--   reiniciar el dev server (el Prisma client viejo no conoce el enum → falla en silencio)

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClientKind') THEN
    CREATE TYPE "ClientKind" AS ENUM ('CLIENTE', 'PROSPECTO', 'ALIADO', 'INTERNO');
  END IF;
END $$;

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "kind" "ClientKind" NOT NULL DEFAULT 'CLIENTE';

-- TAM: nullable a propósito. NULL = "Ventas todavía no lo estimó", que NO es 0.
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "tamUsd" DECIMAL(12,2);

-- BACKFILL: el booleano viejo era binario (prospecto o no). Todo lo que era prospecto
-- pasa a PROSPECTO; el resto queda en el default CLIENTE. Aliados e internos NO se
-- adivinan desde el nombre — los marca una persona por la interfaz (es el punto del pedido).
UPDATE "Client" SET "kind" = 'PROSPECTO' WHERE "isProspect" = true AND "kind" = 'CLIENTE';

COMMIT;

-- Verificación (la suma de PROSPECTO debe coincidir con los isProspect=true de antes):
--   SELECT "kind", count(*) FROM "Client" GROUP BY "kind" ORDER BY 2 DESC;
--   SELECT count(*) FROM "Client" WHERE "isProspect" = true AND "kind" <> 'PROSPECTO'; -- debe dar 0
