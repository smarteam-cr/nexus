-- 2026-10-26 · N2 · Probar la escala con cualquier empresa (PruebaDeLaEscala).
--
-- Cada fila es UNA comparación: para una empresa y un área de la escala, el nivel que dio la escala (con la versión
-- publicada o con el borrador) y el que cree el equipo (quien prueba o el CSE de la cuenta), con quién lo dijo y cuándo.
-- Volver a probar suma otra fila; el resumen de los super admin cuenta la última de cada empresa y área. La escribe solo
-- lib/escala/prueba/servidor.ts. Interno: el cliente no la ve. Wherex no entra nunca (lo frena el código).
--
-- ADITIVO: 1 tabla nueva con RLS y una política RESTRICTIVE que niega todo a anon/authenticated (solo la lee Prisma).
--
-- ⛔ ORDEN: esto va ANTES del deploy. /api/health responde 503 sin esta tabla y deploy.sh revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-26-prueba-de-la-escala.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`. Se puede correr dos veces.

CREATE TABLE IF NOT EXISTS "PruebaDeLaEscala" (
  "id"                 TEXT PRIMARY KEY,
  "clientId"           TEXT NOT NULL REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "exploracionId"      TEXT REFERENCES "ExploracionDeVenta"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "areaId"             TEXT NOT NULL,
  "areaNombre"         TEXT NOT NULL,
  "escalaVersion"      TEXT NOT NULL,
  "esBorrador"         BOOLEAN NOT NULL DEFAULT false,
  "revisionDelBorrador" INTEGER,
  "edicion"            TEXT,
  "nivelDeLaEscala"    TEXT NOT NULL,
  "nivelQueCree"       TEXT NOT NULL,
  "creePorEmail"       TEXT NOT NULL,
  "registradoPorEmail" TEXT NOT NULL,
  "detalle"            JSONB NOT NULL,
  "nota"               TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PruebaDeLaEscala_clientId_createdAt_idx" ON "PruebaDeLaEscala"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "PruebaDeLaEscala_escalaVersion_createdAt_idx" ON "PruebaDeLaEscala"("escalaVersion", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PruebaDeLaEscala_niveles_check') THEN
    ALTER TABLE "PruebaDeLaEscala" ADD CONSTRAINT "PruebaDeLaEscala_niveles_check"
      CHECK ("nivelDeLaEscala" IN ('D', 'I', 'F', 'E', 'O') AND "nivelQueCree" IN ('D', 'I', 'F', 'E', 'O'));
  END IF;
END $$;

ALTER TABLE "PruebaDeLaEscala" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'PruebaDeLaEscala' AND policyname = 'deny_all_non_superuser') THEN
    CREATE POLICY "deny_all_non_superuser" ON "PruebaDeLaEscala" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
END $$;
