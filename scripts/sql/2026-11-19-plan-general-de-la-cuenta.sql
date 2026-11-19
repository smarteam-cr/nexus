-- 2026-11-19 · El plan general de la cuenta: los loops de varios proyectos en un solo gantt (kölbi, pedido de Elías).
--
-- SOLO ADITIVO, inocuo para el código viejo (que no lee nada de esto):
--   "TimelinePhase"."loopNumero"     el número del loop que ES esta fase (01 · Customer 360°…). null = una fase común.
--                                    Las fases con número son las filas del plan general de la cuenta, en ese orden.
--   "TimelineTask"."semanas"         cuántas semanas dura la tarea desde su `weekIndex`. null = una (lo de siempre).
--   "TimelineTask"."tipoDeTrabajo"   diagnostico | diseno | ejecucion | optimizacion | medicion | continuidad | cierre.
--                                    null = sin tipo (todas las tareas de antes).
--   "AccesoAlPlanGeneral"            el enlace con que el cliente ve el plan general en /external/plan/[token] y la
--                                    foto PUBLICADA que ve (como AccesoALaEscala). Uno por cuenta; revocable.
--                                    Con RLS y sin policies (lock-down, ARCHITECTURE §4.5): solo Prisma la lee.
--
-- Se puede correr dos veces. Va ANTES del deploy del código que la usa.
--
-- Volver atrás (borra lo nuevo; con revisión):
--   DROP TABLE IF EXISTS "AccesoAlPlanGeneral";
--   ALTER TABLE "TimelinePhase" DROP COLUMN IF EXISTS "loopNumero";
--   ALTER TABLE "TimelineTask" DROP COLUMN IF EXISTS "semanas", DROP COLUMN IF EXISTS "tipoDeTrabajo";
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-11-19-plan-general-de-la-cuenta.sql; Remove-Item Env:ALLOW_PROD_WRITE

ALTER TABLE "TimelinePhase" ADD COLUMN IF NOT EXISTS "loopNumero" INTEGER;
ALTER TABLE "TimelineTask" ADD COLUMN IF NOT EXISTS "semanas" INTEGER;
ALTER TABLE "TimelineTask" ADD COLUMN IF NOT EXISTS "tipoDeTrabajo" TEXT;

CREATE TABLE IF NOT EXISTS "AccesoAlPlanGeneral" (
  "id"           TEXT NOT NULL,
  "clientId"     TEXT NOT NULL,
  "accessToken"  TEXT NOT NULL,
  "enabledAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt"    TIMESTAMP(3),
  "lastUsedAt"   TIMESTAMP(3),
  "creadoPor"    TEXT,
  "publicado"    JSONB,
  "publicadoEn"  TIMESTAMP(3),
  "publicadoPor" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccesoAlPlanGeneral_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccesoAlPlanGeneral_clientId_key" ON "AccesoAlPlanGeneral" ("clientId");
CREATE UNIQUE INDEX IF NOT EXISTS "AccesoAlPlanGeneral_accessToken_key" ON "AccesoAlPlanGeneral" ("accessToken");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccesoAlPlanGeneral_clientId_fkey') THEN
    ALTER TABLE "AccesoAlPlanGeneral" ADD CONSTRAINT "AccesoAlPlanGeneral_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "AccesoAlPlanGeneral" ENABLE ROW LEVEL SECURITY;
