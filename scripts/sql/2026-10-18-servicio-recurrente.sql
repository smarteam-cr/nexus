-- scripts/sql/2026-10-18-servicio-recurrente.sql — el servicio recurrente de cada proyecto (roadmap «La siguiente
-- serie», iniciativa 4). Ver lib/servicios/catalogo.ts y DECISIONS «El servicio recurrente, dentro de la ficha».
--
-- Cuatro columnas en "Project": la clave del servicio del catálogo, desde cuándo corre, lo que la persona hizo con sus
-- rutinas y la propuesta de la que nació. Sin tabla nueva.
--
-- ADITIVO y se puede correr dos veces. Antes del deploy que trae el modelo (sin las columnas, /api/health responde 503 y
-- el deploy se revierte solo):
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-10-18-servicio-recurrente.sql

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "servicioRecurrente" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "servicioDesde" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "servicioRutinas" JSONB;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "servicioPropuestaId" TEXT;

-- "Project" ya tiene RLS (lock-down total, prisma/policies.sql); se repite por si se corre sobre una base que no lo tenga.
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;

-- Verificación:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'Project' AND column_name IN ('servicioRecurrente', 'servicioDesde', 'servicioRutinas', 'servicioPropuestaId');
