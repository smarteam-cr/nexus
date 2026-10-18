-- 2026-10-17 · SmartLoop: recomendar la recurrencia y la ruta del servicio para el cliente
-- (docs/smartloop-plan.md, etapas 6 y 7).
--
-- · RecomendacionDeRecurrencia (nueva): lo que decidió una persona sobre «pasar este servicio temporal a SmartLoop».
--   Sin fila, la recomendación está pendiente (la calcula lib/servicios/recurrencia.ts).
-- · Project: la ruta del servicio publicada al cliente (/external/ciclos/[acceso]): cuándo se subió y la foto
--   congelada (lib/servicios/ruta-del-servicio.ts).
--
-- ADITIVO: una tabla nueva y dos columnas nullable. RLS encendido y la política RESTRICTIVE que niega todo
-- (la tabla es interna: Prisma entra con BYPASSRLS, el anon de Supabase no lee nada).
--
-- ⛔ ORDEN: esto va ANTES del deploy. /api/health responde 503 sin estas columnas y deploy.sh revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-17-smartloop-recurrencia-y-ruta.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`. Se puede correr dos veces.

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "ciclosPublishedAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "ciclosPublicados" JSONB;

CREATE TABLE IF NOT EXISTS "RecomendacionDeRecurrencia" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "servicio" TEXT NOT NULL DEFAULT 'smartloop',
  "estado" TEXT NOT NULL,
  "accion" TEXT,
  "motivo" TEXT,
  "tareaId" TEXT,
  "porque" JSONB,
  "decididoPor" TEXT NOT NULL,
  "decididoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecomendacionDeRecurrencia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RecomendacionDeRecurrencia_projectId_key" ON "RecomendacionDeRecurrencia"("projectId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecomendacionDeRecurrencia_projectId_fkey') THEN
    ALTER TABLE "RecomendacionDeRecurrencia"
      ADD CONSTRAINT "RecomendacionDeRecurrencia_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecomendacionDeRecurrencia_estado_check') THEN
    ALTER TABLE "RecomendacionDeRecurrencia"
      ADD CONSTRAINT "RecomendacionDeRecurrencia_estado_check" CHECK ("estado" IN ('usada', 'descartada'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecomendacionDeRecurrencia_accion_check') THEN
    ALTER TABLE "RecomendacionDeRecurrencia"
      ADD CONSTRAINT "RecomendacionDeRecurrencia_accion_check" CHECK (
        ("estado" = 'usada' AND "accion" IN ('tarea', 'alta')) OR ("estado" = 'descartada' AND "accion" IS NULL)
      );
  END IF;
END $$;

ALTER TABLE "RecomendacionDeRecurrencia" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'RecomendacionDeRecurrencia' AND policyname = 'deny_all_non_superuser') THEN
    CREATE POLICY "deny_all_non_superuser" ON "RecomendacionDeRecurrencia" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
END $$;
