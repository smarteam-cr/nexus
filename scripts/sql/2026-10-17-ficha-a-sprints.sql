-- scripts/sql/2026-10-17-ficha-a-sprints.sql — quiénes están en el sprint de cada equipo (ficha A del roadmap).
--
-- Customer Success, Marketing y Desarrollo eligen la serie de su reunión de sprint y quiénes están. La serie ya vive en
-- "FuenteDeTareas" (scripts/sql/2026-10-09-tareas.sql); acá solo se suma la lista de personas.
--
-- ADITIVO y se puede correr dos veces. Antes del deploy que trae el modelo (sin la columna, /api/health responde 503).
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-10-17-ficha-a-sprints.sql

ALTER TABLE "FuenteDeTareas" ADD COLUMN IF NOT EXISTS "personas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- La tabla ya tenía RLS y su política RESTRICTIVE; se repiten por si se corre sobre una base que no las tenga.
ALTER TABLE "FuenteDeTareas" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "FuenteDeTareas";
CREATE POLICY deny_all_non_superuser ON "FuenteDeTareas" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- Verificación:
--   SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'FuenteDeTareas' AND column_name = 'personas';
