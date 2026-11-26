-- 2026-11-26 · El plan general es un objeto de la cuenta: su lista de proyectos y sus propias fases (etapa 1, kölbi).
-- DECISIONS «El plan general es un objeto de la cuenta, con su lista de proyectos y sus propias fases».
--
-- SOLO ADITIVO, inocuo para el código viejo:
--   "PlanGeneral"                    el plan de una cuenta (uno por cuenta, CASCADE con la ficha).
--   "ProyectoDelPlan"                la lista EXPLÍCITA de proyectos del plan (pivote plan↔proyecto).
--   "ProjectTimeline"."planId"       un cronograma puede ser de un plan: sus fases son las fases PROPIAS del plan.
--   "ProjectTimeline"."projectId"    deja de ser obligatoria (un cronograma de plan no tiene proyecto). El código viejo
--                                    siempre la escribe, así que relajarla no le cambia nada.
--   CHECK "ProjectTimeline_un_solo_dueno"   exactamente uno de los dos (proyecto o plan). Todas las filas de hoy
--                                    tienen proyecto: se valida al crearse.
-- Las dos tablas nuevas con RLS y sin policies (lock-down, ARCHITECTURE §4.5): solo Prisma las lee.
--
-- Se puede correr dos veces. Va ANTES del deploy del código que la usa (el /api/health la pide).
--
-- ⚠ «Inocuo para el código viejo» vale mientras no exista ningún plan. Después del script de kölbi
-- (scripts/kolbi-plan-de-la-cuenta.ts --apply) hay un cronograma SIN proyecto, y el código de antes de este cambio lo
-- lee como si tuviera uno (los resultados de «¿cuánto te tomó?», el INV22): para volver a una versión anterior, antes
-- se borran los cronogramas de plan (el primer DELETE de abajo).
--
-- Volver atrás (con revisión; antes, borrar los cronogramas de plan, que no tienen proyecto):
--   DELETE FROM "ProjectTimeline" WHERE "planId" IS NOT NULL;
--   ALTER TABLE "ProjectTimeline" DROP CONSTRAINT IF EXISTS "ProjectTimeline_un_solo_dueno";
--   ALTER TABLE "ProjectTimeline" DROP COLUMN IF EXISTS "planId";
--   ALTER TABLE "ProjectTimeline" ALTER COLUMN "projectId" SET NOT NULL;
--   DROP TABLE IF EXISTS "ProyectoDelPlan";
--   DROP TABLE IF EXISTS "PlanGeneral";
--
-- Simulacro:  npm run db:sql -- scripts/sql/2026-11-26-plan-general-objeto-de-la-cuenta.sql
-- Aplicar (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/aplicar-sql.ts scripts/sql/2026-11-26-plan-general-objeto-de-la-cuenta.sql --apply; Remove-Item Env:ALLOW_PROD_WRITE

CREATE TABLE IF NOT EXISTS "PlanGeneral" (
  "id"        TEXT NOT NULL,
  "clientId"  TEXT NOT NULL,
  "creadoPor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanGeneral_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PlanGeneral_clientId_key" ON "PlanGeneral" ("clientId");
DO $$ BEGIN
  ALTER TABLE "PlanGeneral" ADD CONSTRAINT "PlanGeneral_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "PlanGeneral" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "ProyectoDelPlan" (
  "id"          TEXT NOT NULL,
  "planId"      TEXT NOT NULL,
  "projectId"   TEXT NOT NULL,
  "agregadoPor" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProyectoDelPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProyectoDelPlan_planId_projectId_key" ON "ProyectoDelPlan" ("planId", "projectId");
CREATE INDEX IF NOT EXISTS "ProyectoDelPlan_projectId_idx" ON "ProyectoDelPlan" ("projectId");
DO $$ BEGIN
  ALTER TABLE "ProyectoDelPlan" ADD CONSTRAINT "ProyectoDelPlan_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "PlanGeneral"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProyectoDelPlan" ADD CONSTRAINT "ProyectoDelPlan_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "ProyectoDelPlan" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "ProjectTimeline" ADD COLUMN IF NOT EXISTS "planId" TEXT;
ALTER TABLE "ProjectTimeline" ALTER COLUMN "projectId" DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectTimeline_planId_key" ON "ProjectTimeline" ("planId");
DO $$ BEGIN
  ALTER TABLE "ProjectTimeline" ADD CONSTRAINT "ProjectTimeline_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "PlanGeneral"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProjectTimeline" ADD CONSTRAINT "ProjectTimeline_un_solo_dueno"
    CHECK (num_nonnulls("projectId", "planId") = 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
