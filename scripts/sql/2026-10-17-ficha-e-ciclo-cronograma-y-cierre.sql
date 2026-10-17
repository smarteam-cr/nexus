-- 2026-10-17 · Ficha E · SmartLoop: el cronograma del ciclo y su cierre (docs/smartloop-plan.md, etapas 3 y 4).
--
-- · CicloDeProyecto: la versión aprobada del cronograma del ciclo (la foto que se le presentó al cliente) y lo que
--   deja la sesión de aprendizaje (la meta evaluada, la propuesta del siguiente ciclo y el cierre con las fotos de
--   los documentos).
-- · CasoDeUso: la fase del cronograma que es el caso de uso en su ciclo, y la decisión que se toma al cerrar.
--
-- ADITIVO: solo columnas nullable o con default. Las dos tablas ya tienen RLS y su política RESTRICTIVE (SQL del
-- 2026-10-11); se repiten abajo por si este archivo corre en una base donde faltan.
--
-- ⛔ ORDEN: esto va ANTES del deploy. /api/health responde 503 sin estas columnas y deploy.sh revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-17-ficha-e-ciclo-cronograma-y-cierre.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`. Se puede correr dos veces.

ALTER TABLE "CicloDeProyecto" ADD COLUMN IF NOT EXISTS "cronogramaAprobado" JSONB;
ALTER TABLE "CicloDeProyecto" ADD COLUMN IF NOT EXISTS "versionAprobada" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CicloDeProyecto" ADD COLUMN IF NOT EXISTS "aprobadoAt" TIMESTAMP(3);
ALTER TABLE "CicloDeProyecto" ADD COLUMN IF NOT EXISTS "aprobadoPor" TEXT;
ALTER TABLE "CicloDeProyecto" ADD COLUMN IF NOT EXISTS "metaResultado" TEXT;
ALTER TABLE "CicloDeProyecto" ADD COLUMN IF NOT EXISTS "metaEvaluada" TEXT;
ALTER TABLE "CicloDeProyecto" ADD COLUMN IF NOT EXISTS "siguienteCiclo" TEXT;
ALTER TABLE "CicloDeProyecto" ADD COLUMN IF NOT EXISTS "cierre" JSONB;

ALTER TABLE "CasoDeUso" ADD COLUMN IF NOT EXISTS "decisionAlCerrar" TEXT;
ALTER TABLE "CasoDeUso" ADD COLUMN IF NOT EXISTS "faseId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CasoDeUso_faseId_fkey') THEN
    ALTER TABLE "CasoDeUso"
      ADD CONSTRAINT "CasoDeUso_faseId_fkey" FOREIGN KEY ("faseId") REFERENCES "TimelinePhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CicloDeProyecto_metaResultado_check') THEN
    ALTER TABLE "CicloDeProyecto"
      ADD CONSTRAINT "CicloDeProyecto_metaResultado_check" CHECK ("metaResultado" IS NULL OR "metaResultado" IN ('cumplida', 'parcial', 'no_cumplida'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CasoDeUso_decisionAlCerrar_check') THEN
    ALTER TABLE "CasoDeUso"
      ADD CONSTRAINT "CasoDeUso_decisionAlCerrar_check" CHECK ("decisionAlCerrar" IS NULL OR "decisionAlCerrar" IN ('cumplido', 'no_cumplido', 'pasa', 'descartado'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "CasoDeUso_faseId_idx" ON "CasoDeUso"("faseId");

ALTER TABLE "CicloDeProyecto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CasoDeUso" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'CicloDeProyecto' AND policyname = 'deny_all_non_superuser') THEN
    CREATE POLICY "deny_all_non_superuser" ON "CicloDeProyecto" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'CasoDeUso' AND policyname = 'deny_all_non_superuser') THEN
    CREATE POLICY "deny_all_non_superuser" ON "CasoDeUso" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
END $$;
