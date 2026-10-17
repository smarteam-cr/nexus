-- 2026-10-17 · Ficha B: la escala de la empresa en el tiempo (VersionDeLaEscala).
--
-- Cada fila es una FOTO de dónde está la empresa en la escala, con su fecha: lo confirmado de una exploración
-- (la preventa o la de un proyecto), dimensión por dimensión, con de dónde sale cada nivel. La escribe solo
-- lib/exploraciones/versiones-de-la-escala.ts. Interno: el cliente no la ve.
--
-- ADITIVO: 1 tabla nueva con RLS y una política RESTRICTIVE que niega todo a anon/authenticated (solo la lee Prisma).
--
-- ⛔ ORDEN: esto va ANTES del deploy. /api/health responde 503 sin esta tabla y deploy.sh revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-17-ficha-b-versiones-de-la-escala.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`. Se puede correr dos veces.

CREATE TABLE IF NOT EXISTS "VersionDeLaEscala" (
  "id"             TEXT PRIMARY KEY,
  "clientId"       TEXT NOT NULL REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "exploracionId"  TEXT REFERENCES "ExploracionDeVenta"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "projectId"      TEXT REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "cicloId"        TEXT REFERENCES "CicloDeProyecto"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "origen"         TEXT NOT NULL,
  "dia"            TEXT NOT NULL,
  "escalaVersion"  TEXT,
  "edicion"        TEXT,
  "foto"           JSONB NOT NULL,
  "huella"         TEXT NOT NULL,
  "creadoPorEmail" TEXT,
  "nota"           TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "VersionDeLaEscala_clientId_createdAt_idx" ON "VersionDeLaEscala"("clientId", "createdAt");
CREATE INDEX IF NOT EXISTS "VersionDeLaEscala_exploracionId_createdAt_idx" ON "VersionDeLaEscala"("exploracionId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VersionDeLaEscala_origen_check') THEN
    ALTER TABLE "VersionDeLaEscala" ADD CONSTRAINT "VersionDeLaEscala_origen_check" CHECK ("origen" IN ('cambio', 'diagnostico', 'manual'));
  END IF;
END $$;

ALTER TABLE "VersionDeLaEscala" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'VersionDeLaEscala' AND policyname = 'deny_all_non_superuser') THEN
    CREATE POLICY "deny_all_non_superuser" ON "VersionDeLaEscala" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
END $$;
