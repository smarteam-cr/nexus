-- 2026-10-25 · Los datos de la empresa (R1), su investigación (R5) y la empresa de HubSpot única (R7b).
--
-- POR QUÉ. Elías decidió el 24 oct que la empresa es el centro de Nexus. De 200 empresas, el TAM estaba vacío en todas,
-- la industria vivía en cinco lugares, el tamaño no se guardaba y la investigación web vivía dentro de la preventa.
-- Decisión completa: docs/DECISIONS.md › «Los datos de la empresa» y «Las llaves de la empresa» (R7b).
--
-- QUÉ ENTRA (ADITIVO: nada se dropea ni se renombra; se puede correr dos veces).
--   1. "Client": los datos de la empresa en columnas (empleados, facturación, país, sitio, industria de Smarteam,
--      edición de la escala, segmento, casa matriz o filial, perfil de negocio, tráfico, base con consentimiento,
--      Insider), cada uno con su fuente y su fecha; y la fuente, la fecha y el cálculo del TAM y de la industria.
--      Todas nullable: en una base con el código viejo no cambia nada.
--   2. "PropuestaDeDato": las propuestas y la historia de cada dato.
--   3. "InvestigacionDeEmpresa": lo que Nexus encontró de la empresa en la web, con su fecha y sus fuentes.
--   4. "Client"."hubspotCompanyId" único (R7b). Medido en producción el 24 oct: 0 ids repetidos. Si hubiera alguno,
--      el CREATE UNIQUE INDEX falla y el archivo entero no queda aplicado (`prisma db execute` lo corre de una vez:
--      probado en la base local). La salida NO es fusionar primero: scripts/merge-duplicate-clients.ts ya lee las
--      columnas que crea este archivo. Se suelta a mano el id de la ficha que sobra
--        UPDATE "Client" SET "hubspotCompanyId" = NULL WHERE "id" = '<la que sobra>';
--      se corre este archivo, y DESPUÉS se fusionan las dos fichas con el script.
--      Justo antes, en solo lectura (tiene que dar 0 filas):
--        SELECT "hubspotCompanyId", count(*) FROM "Client" WHERE "hubspotCompanyId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
--
-- ⚠ ORDEN: ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce las columnas) y el deploy
-- se revierte solo.
--
-- Volver atrás (borra los datos nuevos; con revisión):
--   DROP INDEX IF EXISTS "Client_hubspotCompanyId_key";
--   DROP TABLE IF EXISTS "InvestigacionDeEmpresa"; DROP TABLE IF EXISTS "PropuestaDeDato";
--   ALTER TABLE "Client" DROP COLUMN IF EXISTS "empleados", ... (las columnas de la lista de abajo).
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-25-datos-de-la-empresa.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate + reiniciar el dev server · npm run check:invariants (INV48) · npm run check:esquema.
-- ⛔ NUNCA `prisma db push`.

-- ── 1. Los datos en "Client" ─────────────────────────────────────────────────────────────────────
ALTER TABLE "Client"
  ADD COLUMN IF NOT EXISTS "tamFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "tamAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "tamCalculo" JSONB,
  ADD COLUMN IF NOT EXISTS "industryFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "industryAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "empleados" INTEGER,
  ADD COLUMN IF NOT EXISTS "empleadosFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "empleadosAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "facturacionAnualUsd" DECIMAL(14,2),
  ADD COLUMN IF NOT EXISTS "facturacionAnualUsdFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "facturacionAnualUsdAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pais" TEXT,
  ADD COLUMN IF NOT EXISTS "paisFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "paisAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sitioWeb" TEXT,
  ADD COLUMN IF NOT EXISTS "sitioWebFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "sitioWebAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "industriaSmarteam" TEXT,
  ADD COLUMN IF NOT EXISTS "industriaSmarteamFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "industriaSmarteamAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "edicionEscala" TEXT,
  ADD COLUMN IF NOT EXISTS "edicionEscalaFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "edicionEscalaAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "segmento" TEXT,
  ADD COLUMN IF NOT EXISTS "segmentoFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "segmentoAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "estructura" TEXT,
  ADD COLUMN IF NOT EXISTS "estructuraFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "estructuraAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "filiales" INTEGER,
  ADD COLUMN IF NOT EXISTS "filialesFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "filialesAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "aQuienVende" TEXT,
  ADD COLUMN IF NOT EXISTS "aQuienVendeFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "aQuienVendeAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "perfilCierre" TEXT,
  ADD COLUMN IF NOT EXISTS "perfilCierreFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "perfilCierreAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "perfilDespues" TEXT,
  ADD COLUMN IF NOT EXISTS "perfilDespuesFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "perfilDespuesAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trafico" TEXT,
  ADD COLUMN IF NOT EXISTS "traficoFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "traficoAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "baseConsentimiento" TEXT,
  ADD COLUMN IF NOT EXISTS "baseConsentimientoFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "baseConsentimientoAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "calificaInsider" TEXT,
  ADD COLUMN IF NOT EXISTS "calificaInsiderFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "calificaInsiderAt" TIMESTAMP(3);

-- ── 2. Las propuestas y la historia ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PropuestaDeDato" (
  "id"            TEXT NOT NULL,
  "clientId"      TEXT NOT NULL,
  "campo"         TEXT NOT NULL,
  "valor"         JSONB NOT NULL,
  "valorAnterior" JSONB,
  "valorDecidido" JSONB,
  "fuente"        TEXT NOT NULL,
  "autorId"       TEXT,
  "cita"          TEXT,
  "enlace"        TEXT,
  "estado"        TEXT NOT NULL DEFAULT 'pendiente',
  "decididaPorId" TEXT,
  "decididaAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PropuestaDeDato_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PropuestaDeDato_estado_valido" CHECK ("estado" IN ('pendiente', 'usada', 'editada', 'descartada', 'aplicada', 'reemplazada')),
  CONSTRAINT "PropuestaDeDato_campo_corto" CHECK (length("campo") BETWEEN 1 AND 80)
);
CREATE INDEX IF NOT EXISTS "PropuestaDeDato_clientId_campo_estado_idx" ON "PropuestaDeDato" ("clientId", "campo", "estado");
CREATE INDEX IF NOT EXISTS "PropuestaDeDato_estado_createdAt_idx" ON "PropuestaDeDato" ("estado", "createdAt");

-- ── 3. La investigación de la empresa ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "InvestigacionDeEmpresa" (
  "id"             TEXT NOT NULL,
  "clientId"       TEXT NOT NULL,
  "hechaAt"        TIMESTAMP(3) NOT NULL,
  "venceAt"        TIMESTAMP(3) NOT NULL,
  "origen"         TEXT NOT NULL,
  "exploracionId"  TEXT,
  "agentRunId"     TEXT,
  "resumen"        TEXT,
  "contenido"      JSONB NOT NULL,
  "fuentes"        JSONB NOT NULL DEFAULT '[]',
  "contrataciones" JSONB NOT NULL DEFAULT '[]',
  "tamanoEstimado" JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvestigacionDeEmpresa_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "InvestigacionDeEmpresa_clientId_hechaAt_idx" ON "InvestigacionDeEmpresa" ("clientId", "hechaAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PropuestaDeDato_clientId_fkey') THEN
    ALTER TABLE "PropuestaDeDato" ADD CONSTRAINT "PropuestaDeDato_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PropuestaDeDato_autorId_fkey') THEN
    ALTER TABLE "PropuestaDeDato" ADD CONSTRAINT "PropuestaDeDato_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PropuestaDeDato_decididaPorId_fkey') THEN
    ALTER TABLE "PropuestaDeDato" ADD CONSTRAINT "PropuestaDeDato_decididaPorId_fkey" FOREIGN KEY ("decididaPorId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvestigacionDeEmpresa_clientId_fkey') THEN
    ALTER TABLE "InvestigacionDeEmpresa" ADD CONSTRAINT "InvestigacionDeEmpresa_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvestigacionDeEmpresa_exploracionId_fkey') THEN
    ALTER TABLE "InvestigacionDeEmpresa" ADD CONSTRAINT "InvestigacionDeEmpresa_exploracionId_fkey" FOREIGN KEY ("exploracionId") REFERENCES "ExploracionDeVenta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InvestigacionDeEmpresa_agentRunId_fkey') THEN
    ALTER TABLE "InvestigacionDeEmpresa" ADD CONSTRAINT "InvestigacionDeEmpresa_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`. RLS sin policy SELECT = cerrado; la
-- RESTRICTIVE lo mantiene cerrado aunque alguien sume mañana una policy permisiva. `postgres` (Prisma) tiene BYPASSRLS.
ALTER TABLE "PropuestaDeDato" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "PropuestaDeDato";
CREATE POLICY deny_all_non_superuser ON "PropuestaDeDato" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

ALTER TABLE "InvestigacionDeEmpresa" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "InvestigacionDeEmpresa";
CREATE POLICY deny_all_non_superuser ON "InvestigacionDeEmpresa" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── 4. La empresa de HubSpot, única (R7b) ────────────────────────────────────────────────────────
-- NULL no choca con NULL en Postgres: las fichas sin empresa de HubSpot conviven.
CREATE UNIQUE INDEX IF NOT EXISTS "Client_hubspotCompanyId_key" ON "Client" ("hubspotCompanyId");

-- ── Verificación (solo lectura, correr aparte) ───────────────────────────────────────────────────
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('PropuestaDeDato', 'InvestigacionDeEmpresa');
--   SELECT indexname FROM pg_indexes WHERE indexname = 'Client_hubspotCompanyId_key';
