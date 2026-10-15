-- 2026-10-15 · Las tareas de HubSpot en Tareas internas
--
-- «Para ti» por equipo, etapa 3 (docs/mi-dia-plan.md): las tareas de HubSpot del equipo entran a Tareas como `Tarea` con
-- `origen = 'hubspot'`, y lo que se cambia de un lado se escribe del otro (lib/tareas-hubspot, job `tareas-hubspot`).
--   · `hubspotTaskId`: el id de la tarea en HubSpot (único).
--   · `hubspotAcordado`: lo último en que Nexus y HubSpot estuvieron de acuerdo; con eso cada copia sabe qué lado cambió.
--   · `hubspotDatos`: el tipo, la secuencia, la hora del vencimiento y el registro asociado.
--   · `hubspotSincronizadaAt`, `hubspotError`: la última vez que se miró y lo que no se pudo escribir allá.
--
-- ADITIVO: cinco columnas nullable, un índice único y un CHECK que ninguna fila de hoy viola. Re-ejecutable.
--
-- ⛔ ORDEN: esto va ANTES del deploy del código que trae las columnas: sin ellas, /api/health responde 503 y el deploy
-- se revierte solo.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-15-tareas-de-hubspot.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

BEGIN;

ALTER TABLE "Tarea" ADD COLUMN IF NOT EXISTS "hubspotTaskId" TEXT;
ALTER TABLE "Tarea" ADD COLUMN IF NOT EXISTS "hubspotAcordado" JSONB;
ALTER TABLE "Tarea" ADD COLUMN IF NOT EXISTS "hubspotDatos" JSONB;
ALTER TABLE "Tarea" ADD COLUMN IF NOT EXISTS "hubspotSincronizadaAt" TIMESTAMP(3);
ALTER TABLE "Tarea" ADD COLUMN IF NOT EXISTS "hubspotError" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Tarea_hubspotTaskId_key" ON "Tarea"("hubspotTaskId");

DO $$
BEGIN
  -- Una tarea de HubSpot, y solo ella, tiene su id de HubSpot.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Tarea_hubspot_con_id') THEN
    ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_hubspot_con_id" CHECK (("origen" = 'hubspot') = ("hubspotTaskId" IS NOT NULL));
  END IF;
END $$;

COMMIT;
