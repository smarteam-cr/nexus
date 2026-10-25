-- 2026-10-25 · La empresa, parte 2: HubSpot en los dos sentidos (R2), los documentos de la empresa (R3), una persona del
-- cliente con su rol (R6) y el perfil de la empresa que usa Nexus (R13).
--
-- POR QUÉ. Elías decidió el 24 oct que la empresa es el centro de Nexus. La parte 1 (2026-10-25-datos-de-la-empresa.sql)
-- dejó los datos en columnas, las propuestas y la investigación. Esta parte suma lo que necesitan los cuatro pasos de
-- arriba. Decisión completa: docs/DECISIONS.md › «La empresa, parte 2».
--
-- QUÉ ENTRA (ADITIVO: nada se dropea ni se renombra; se puede correr dos veces).
--   1. "PropuestaDeDato": lo que se escribió en HubSpot por cada decisión (la propiedad, lo que tenía antes, cuándo y el
--      error si falló). Es lo que lee el script de vuelta (scripts/hubspot-empresa-volver-atras.ts).
--   2. "ProjectCanvas"."clientId": un documento puede ser de la EMPRESA, sin proyecto ni propuesta. Solo se llena en esos
--      documentos (el dueño de los demás sale de su proyecto o su propuesta); el CHECK impide las dos cosas a la vez.
--      Medido en producción el 24 oct: 777 documentos, ninguno sin dueño y ninguno con dos.
--   3. "PersonaDeLaEmpresa": una persona del cliente, una sola por correo y empresa, con su cargo, su contacto de HubSpot y
--      su rol (decide, influye, usa).
--   4. "PerfilDeLaEmpresa": el perfil de la empresa que usa Nexus (hoy Smarteam): propuesta de valor, position statement,
--      tono, servicios y clientes de referencia. Una fila por empresa.
--   5. "IcpItem"."clientId" y "BuyerPersona"."clientId": el cliente ideal y las buyer personas cuelgan de esa empresa.
--      Nullable: el código viejo crea filas sin él, y la carga (scripts/cargar-perfil-de-smarteam.ts) llena las 48 de hoy.
--
-- ⚠ ORDEN: ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce las columnas) y el deploy
-- se revierte solo.
--
-- Volver atrás (borra lo nuevo; con revisión):
--   DROP TABLE IF EXISTS "PersonaDeLaEmpresa"; DROP TABLE IF EXISTS "PerfilDeLaEmpresa";
--   ALTER TABLE "ProjectCanvas" DROP CONSTRAINT IF EXISTS "ProjectCanvas_un_solo_dueno"; DROP INDEX IF EXISTS "ProjectCanvas_clientId_slug_key";
--   ALTER TABLE "ProjectCanvas" DROP COLUMN IF EXISTS "clientId";
--   ALTER TABLE "IcpItem" DROP COLUMN IF EXISTS "clientId"; ALTER TABLE "BuyerPersona" DROP COLUMN IF EXISTS "clientId";
--   ALTER TABLE "PropuestaDeDato" DROP COLUMN IF EXISTS "hubspotPropiedad", DROP COLUMN IF EXISTS "hubspotAnterior",
--     DROP COLUMN IF EXISTS "hubspotEscritaAt", DROP COLUMN IF EXISTS "hubspotError";
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-25-empresa-parte-2.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate + reiniciar el dev server · npm run check:invariants (INV51) · npm run check:esquema.
-- ⛔ NUNCA `prisma db push`.

-- ── 1. Lo que se escribió en HubSpot ─────────────────────────────────────────────────────────────
ALTER TABLE "PropuestaDeDato"
  ADD COLUMN IF NOT EXISTS "hubspotPropiedad" TEXT,
  ADD COLUMN IF NOT EXISTS "hubspotAnterior" TEXT,
  ADD COLUMN IF NOT EXISTS "hubspotEscritaAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "hubspotError" TEXT;
CREATE INDEX IF NOT EXISTS "PropuestaDeDato_hubspotEscritaAt_idx" ON "PropuestaDeDato" ("hubspotEscritaAt");

-- ── 2. Los documentos de la empresa ──────────────────────────────────────────────────────────────
ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
CREATE INDEX IF NOT EXISTS "ProjectCanvas_clientId_idx" ON "ProjectCanvas" ("clientId");
-- Una pieza por empresa, como el índice parcial de (projectId, slug) para los proyectos.
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectCanvas_clientId_slug_key" ON "ProjectCanvas" ("clientId", "slug")
  WHERE "clientId" IS NOT NULL AND "slug" IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectCanvas_clientId_fkey') THEN
    ALTER TABLE "ProjectCanvas" ADD CONSTRAINT "ProjectCanvas_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  -- Un documento de la empresa no tiene proyecto ni propuesta: si los tuviera, habría dos dueños que pueden no coincidir.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectCanvas_un_solo_dueno') THEN
    ALTER TABLE "ProjectCanvas" ADD CONSTRAINT "ProjectCanvas_un_solo_dueno"
      CHECK ("clientId" IS NULL OR ("projectId" IS NULL AND "businessCaseId" IS NULL));
  END IF;
END $$;

-- ── 3. Una persona del cliente ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PersonaDeLaEmpresa" (
  "id"                  TEXT NOT NULL,
  "clientId"            TEXT NOT NULL,
  "correo"              TEXT NOT NULL,
  "nombre"              TEXT,
  "cargo"               TEXT,
  "contactoDeHubspotId" TEXT,
  "rol"                 TEXT,
  "rolFuente"           TEXT,
  "rolAt"               TIMESTAMP(3),
  "lado"                TEXT NOT NULL DEFAULT 'empresa',
  "origenes"            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "reuniones"           INTEGER NOT NULL DEFAULT 0,
  "ultimaReunionAt"     TIMESTAMP(3),
  "vigente"             BOOLEAN NOT NULL DEFAULT true,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PersonaDeLaEmpresa_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PersonaDeLaEmpresa_correo_minusculas" CHECK ("correo" = lower("correo") AND position('@' in "correo") > 1),
  CONSTRAINT "PersonaDeLaEmpresa_rol_valido" CHECK ("rol" IS NULL OR "rol" IN ('decide', 'influye', 'usa')),
  CONSTRAINT "PersonaDeLaEmpresa_lado_valido" CHECK ("lado" IN ('empresa', 'externa'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "PersonaDeLaEmpresa_clientId_correo_key" ON "PersonaDeLaEmpresa" ("clientId", "correo");
CREATE INDEX IF NOT EXISTS "PersonaDeLaEmpresa_correo_idx" ON "PersonaDeLaEmpresa" ("correo");
CREATE INDEX IF NOT EXISTS "PersonaDeLaEmpresa_contactoDeHubspotId_idx" ON "PersonaDeLaEmpresa" ("contactoDeHubspotId");

-- ── 4. El perfil de la empresa que usa Nexus ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PerfilDeLaEmpresa" (
  "id"                   TEXT NOT NULL,
  "clientId"             TEXT NOT NULL,
  "propuestaDeValor"     TEXT,
  "positionStatement"    TEXT,
  "tono"                 TEXT,
  "servicios"            JSONB NOT NULL DEFAULT '[]',
  "clientesDeReferencia" JSONB NOT NULL DEFAULT '[]',
  "actualizadoPorEmail"  TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PerfilDeLaEmpresa_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PerfilDeLaEmpresa_clientId_key" ON "PerfilDeLaEmpresa" ("clientId");

-- ── 5. El cliente ideal y las buyer personas, de esa empresa ─────────────────────────────────────
ALTER TABLE "IcpItem" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "BuyerPersona" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
CREATE INDEX IF NOT EXISTS "IcpItem_clientId_idx" ON "IcpItem" ("clientId");
CREATE INDEX IF NOT EXISTS "BuyerPersona_clientId_idx" ON "BuyerPersona" ("clientId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PersonaDeLaEmpresa_clientId_fkey') THEN
    ALTER TABLE "PersonaDeLaEmpresa" ADD CONSTRAINT "PersonaDeLaEmpresa_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PersonaDeLaEmpresa_contactoDeHubspotId_fkey') THEN
    ALTER TABLE "PersonaDeLaEmpresa" ADD CONSTRAINT "PersonaDeLaEmpresa_contactoDeHubspotId_fkey" FOREIGN KEY ("contactoDeHubspotId") REFERENCES "ContactoDeHubspot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PerfilDeLaEmpresa_clientId_fkey') THEN
    ALTER TABLE "PerfilDeLaEmpresa" ADD CONSTRAINT "PerfilDeLaEmpresa_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  -- SET NULL y no CASCADE: borrar la ficha de Smarteam por error no se puede llevar el cliente ideal.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IcpItem_clientId_fkey') THEN
    ALTER TABLE "IcpItem" ADD CONSTRAINT "IcpItem_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BuyerPersona_clientId_fkey') THEN
    ALTER TABLE "BuyerPersona" ADD CONSTRAINT "BuyerPersona_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`. RLS sin policy SELECT = cerrado; la
-- RESTRICTIVE lo mantiene cerrado aunque alguien sume mañana una policy permisiva. `postgres` (Prisma) tiene BYPASSRLS.
ALTER TABLE "PersonaDeLaEmpresa" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "PersonaDeLaEmpresa";
CREATE POLICY deny_all_non_superuser ON "PersonaDeLaEmpresa" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

ALTER TABLE "PerfilDeLaEmpresa" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "PerfilDeLaEmpresa";
CREATE POLICY deny_all_non_superuser ON "PerfilDeLaEmpresa" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ───────────────────────────────────────────────────
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('PersonaDeLaEmpresa', 'PerfilDeLaEmpresa');
--   SELECT conname FROM pg_constraint WHERE conname IN ('ProjectCanvas_un_solo_dueno', 'ProjectCanvas_clientId_fkey');
--   SELECT indexname FROM pg_indexes WHERE indexname = 'ProjectCanvas_clientId_slug_key';
