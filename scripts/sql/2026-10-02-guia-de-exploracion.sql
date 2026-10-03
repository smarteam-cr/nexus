-- 2026-10-02 · La GUÍA DE EXPLORACIÓN del CSE (reemplaza al informe de exploración; plan aprobado por
-- Elías el 2026-10-02). Un lienzo por proyecto: lo confirmado (`contenido`) aparte de lo que propone el
-- agente (`propuesta`), con versión para que dos pestañas no se pisen. Ver lib/guia-exploracion/.
--
-- ADITIVO: 1 tabla. El informe viejo (canvas «Exploración») NO se toca: queda en solo lectura.
--
-- ⛔ ORDEN: ANTES del deploy (la pantalla de Exploración la lee al abrir).
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-02-guia-de-exploracion.sql
--
-- ⚠ SIN `--schema`. Después, en la máquina de desarrollo: `npx prisma generate`. NUNCA `prisma db push`.

CREATE TABLE IF NOT EXISTS "GuiaDeExploracion" (
  "id"               TEXT NOT NULL,
  "projectId"        TEXT NOT NULL,
  "contenido"        JSONB NOT NULL DEFAULT '{}',
  "propuesta"        JSONB NOT NULL DEFAULT '{}',
  "version"          INTEGER NOT NULL DEFAULT 0,
  "corriendoDesde"   TIMESTAMP(3),
  "corridaModo"      TEXT,
  "corridaTerminoAt" TIMESTAMP(3),
  "corridaError"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuiaDeExploracion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GuiaDeExploracion_projectId_key" ON "GuiaDeExploracion" ("projectId");

DO $$ BEGIN
  ALTER TABLE "GuiaDeExploracion" ADD CONSTRAINT "GuiaDeExploracion_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- OBLIGATORIO: Supabase le da SELECT a `anon` sobre todo `public`, y esto guarda lo que el cliente cuenta
-- en las sesiones. RLS sin policy = nadie lo lee con la clave pública; Nexus entra con el rol del servidor.
ALTER TABLE "GuiaDeExploracion" ENABLE ROW LEVEL SECURITY;
