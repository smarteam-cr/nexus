-- 2026-10-14 · Los negocios abiertos de HubSpot y el dueño de cada empresa
--
-- «Para ti» por equipo, etapa 1 (docs/mi-dia-plan.md): Ventas ve sus cierres más cerca, su cartera y lo ponderado.
--   · `NegocioAbierto`: una fila por negocio abierto de los tres pipelines de venta propia, con su dueño, su empresa,
--     la fecha de cierre, el monto, la probabilidad, el siguiente paso de HubSpot y la última y próxima actividad. La
--     copia lib/ventas/sync-negocios-abiertos.ts (job `negocios-abiertos`). Nunca se borra una fila: un negocio que
--     se cerró queda `abierto = false`.
--   · `Client.hubspotOwnerId` + `hubspotOwnerEmail`: el dueño de la empresa en HubSpot. La otra mitad de la cartera.
--
-- ADITIVO: una tabla nueva y dos columnas nullable. Re-ejecutable.
--
-- ⛔ ORDEN: esto va ANTES del deploy del código que trae el modelo: sin la tabla, /api/health responde 503 y el deploy
-- se revierte solo.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-14-negocios-abiertos.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

BEGIN;

-- ── El dueño de cada empresa ──
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "hubspotOwnerId" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "hubspotOwnerEmail" TEXT;

-- ── Los negocios abiertos ──
CREATE TABLE IF NOT EXISTS "NegocioAbierto" (
  "id"                     TEXT NOT NULL,
  "hubspotDealId"          TEXT NOT NULL,
  "nombre"                 TEXT NOT NULL,
  "pipelineId"             TEXT NOT NULL,
  "pipelineLabel"          TEXT,
  "etapaId"                TEXT NOT NULL,
  "etapaLabel"             TEXT,
  "probabilidad"           DOUBLE PRECISION,
  "fechaCierre"            DATE,
  "monto"                  DECIMAL(14,2),
  "moneda"                 TEXT NOT NULL DEFAULT 'USD',
  "siguientePasoHubspot"   TEXT,
  "proximaActividadAt"     TIMESTAMP(3),
  "ultimaActividadAt"      TIMESTAMP(3),
  "creadoEnHubspot"        TIMESTAMP(3),
  "hubspotOwnerId"         TEXT,
  "vendedorId"             TEXT,
  "hubspotCompanyId"       TEXT,
  "empresaNombre"          TEXT,
  "clientId"               TEXT,
  "abierto"                BOOLEAN NOT NULL DEFAULT true,
  "cerradoEn"              TIMESTAMP(3),
  "preguntaPospuestaHasta" TIMESTAMP(3),
  "propuesta"              JSONB,
  "respondidoPor"          TEXT,
  "respondidoAt"           TIMESTAMP(3),
  "sincronizadoEn"         TIMESTAMP(3) NOT NULL,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NegocioAbierto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NegocioAbierto_hubspotDealId_key" ON "NegocioAbierto"("hubspotDealId");
CREATE INDEX IF NOT EXISTS "NegocioAbierto_vendedorId_abierto_idx" ON "NegocioAbierto"("vendedorId", "abierto");
CREATE INDEX IF NOT EXISTS "NegocioAbierto_clientId_idx" ON "NegocioAbierto"("clientId");
CREATE INDEX IF NOT EXISTS "NegocioAbierto_hubspotCompanyId_idx" ON "NegocioAbierto"("hubspotCompanyId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NegocioAbierto_vendedorId_fkey') THEN
    ALTER TABLE "NegocioAbierto"
      ADD CONSTRAINT "NegocioAbierto_vendedorId_fkey"
      FOREIGN KEY ("vendedorId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NegocioAbierto_clientId_fkey') THEN
    ALTER TABLE "NegocioAbierto"
      ADD CONSTRAINT "NegocioAbierto_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Tabla interna: RLS sin policy SELECT, y la RESTRICTIVE que tapa al anon aunque alguien sume una permisiva.
ALTER TABLE "NegocioAbierto" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'NegocioAbierto' AND policyname = 'deny_all_non_superuser') THEN
    CREATE POLICY "deny_all_non_superuser" ON "NegocioAbierto" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
END $$;

COMMIT;
