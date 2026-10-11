-- 2026-10-08 · Las metas comerciales de HubSpot y quién vendió cada negocio ganado
--
-- Pedido de Elías (2026-10-08): el modelo nuevo de comisiones se mueve con la meta del año de cada persona, y esas
-- metas viven en HubSpot («OFICIAL | META 2026 - SMARTEAM»: Andrés US$335.000, Marco US$400.000). Se guardan como dato
-- GENERAL de Nexus, para que cualquier módulo las lea:
--   · `MetaComercial`: una fila por tramo de meta de HubSpot (goal target), con su monto y el avance que calcula
--     HubSpot. La copia `lib/ventas/metas-sync.ts` (job `ventas-ganadas-daily`).
--   · `VentaGanada.hubspotOwnerId` + `vendedorId`: el dueño del trato en HubSpot y la persona de Nexus que le
--     corresponde. La copia de negocios ganados los completa en su próxima corrida.
--
-- ADITIVO: una tabla nueva y dos columnas nullable. Re-ejecutable.
--
-- ⛔ ORDEN: esto va ANTES del deploy del código que trae los modelos: sin las columnas, /api/health responde 503 y el
-- deploy se revierte solo.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-08-metas-y-vendedor.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

BEGIN;

-- ── Quién vendió cada negocio ganado ──
ALTER TABLE "VentaGanada" ADD COLUMN IF NOT EXISTS "hubspotOwnerId" TEXT;
ALTER TABLE "VentaGanada" ADD COLUMN IF NOT EXISTS "vendedorId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VentaGanada_vendedorId_fkey') THEN
    ALTER TABLE "VentaGanada"
      ADD CONSTRAINT "VentaGanada_vendedorId_fkey"
      FOREIGN KEY ("vendedorId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "VentaGanada_vendedorId_idx" ON "VentaGanada"("vendedorId");

-- ── Las metas comerciales ──
CREATE TABLE IF NOT EXISTS "MetaComercial" (
  "id"                  TEXT NOT NULL,
  "hubspotGoalTargetId" TEXT NOT NULL,
  "hubspotGoalId"       TEXT,
  "nombre"              TEXT NOT NULL,
  "tipo"                TEXT,
  "hubspotOwnerId"      TEXT,
  "hubspotUserId"       TEXT,
  "teamMemberId"        TEXT,
  "desde"               TIMESTAMP(3) NOT NULL,
  "hasta"               TIMESTAMP(3) NOT NULL,
  "monto"               DECIMAL(14,2) NOT NULL,
  "avance"              DECIMAL(14,2),
  "moneda"              TEXT NOT NULL DEFAULT 'USD',
  "estado"              TEXT,
  "vigente"             BOOLEAN NOT NULL DEFAULT true,
  "sincronizadoEn"      TIMESTAMP(3) NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetaComercial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MetaComercial_hubspotGoalTargetId_key" ON "MetaComercial"("hubspotGoalTargetId");
CREATE INDEX IF NOT EXISTS "MetaComercial_teamMemberId_idx" ON "MetaComercial"("teamMemberId");
CREATE INDEX IF NOT EXISTS "MetaComercial_desde_idx" ON "MetaComercial"("desde");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MetaComercial_teamMemberId_fkey') THEN
    ALTER TABLE "MetaComercial"
      ADD CONSTRAINT "MetaComercial_teamMemberId_fkey"
      FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Interna: nadie la lee con la clave pública.
ALTER TABLE "MetaComercial" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "MetaComercial";
CREATE POLICY deny_all_non_superuser ON "MetaComercial" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

COMMIT;
