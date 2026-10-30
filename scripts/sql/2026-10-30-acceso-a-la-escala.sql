-- 2026-10-30 · La escala que se le presenta al cliente: el enlace de «Acceso» de La escala.
--
-- Una tabla nueva, SOLO ADITIVA, inocua para el código viejo:
--   "AccesoALaEscala": el enlace con que la empresa ve su escala en /external/escala/[token]. Uno por exploración (la de
--   la cuenta o la de la preventa); revocable. La empresa sale de la exploración: la tabla no la repite.
--   Con RLS y sin policies (lock-down, ARCHITECTURE §4.5): solo Prisma la lee.
--
-- Se puede correr dos veces. Va ANTES del deploy del código que la usa.
--
-- Volver atrás (borra lo nuevo; con revisión):
--   DROP TABLE IF EXISTS "AccesoALaEscala";
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-30-acceso-a-la-escala.sql; Remove-Item Env:ALLOW_PROD_WRITE

CREATE TABLE IF NOT EXISTS "AccesoALaEscala" (
  "id"            TEXT NOT NULL,
  "exploracionId" TEXT NOT NULL,
  "accessToken"   TEXT NOT NULL,
  "enabledAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt"     TIMESTAMP(3),
  "lastUsedAt"    TIMESTAMP(3),
  "creadoPor"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccesoALaEscala_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccesoALaEscala_exploracionId_key" ON "AccesoALaEscala" ("exploracionId");
CREATE UNIQUE INDEX IF NOT EXISTS "AccesoALaEscala_accessToken_key" ON "AccesoALaEscala" ("accessToken");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccesoALaEscala_exploracionId_fkey') THEN
    ALTER TABLE "AccesoALaEscala" ADD CONSTRAINT "AccesoALaEscala_exploracionId_fkey" FOREIGN KEY ("exploracionId") REFERENCES "ExploracionDeVenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "AccesoALaEscala" ENABLE ROW LEVEL SECURITY;
