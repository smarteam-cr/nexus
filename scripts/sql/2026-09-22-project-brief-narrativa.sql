-- 2026-09-22 · El resumen del proyecto gana un párrafo en prosa arriba de las afirmaciones.
--
-- Aditiva y nullable: los ~N briefs ya generados quedan con `narrativa` en NULL y la pantalla
-- simplemente no pinta el bloque. Nada que backfillear — la narrativa nace en la próxima
-- regeneración de cada proyecto.
--
-- ⛔ ORDEN OBLIGATORIO: esto se aplica ANTES del deploy. El código nuevo SELECCIONA la columna
-- (`app/api/projects/[projectId]/gps/route.ts`), así que si el deploy llega primero, la ficha de
-- CUALQUIER cliente revienta contra Postgres — es el incidente de `closeDateOverride` (Tanda M),
-- byte por byte.
--
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-22-project-brief-narrativa.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe (la conexión sale de prisma.config.ts) y
-- el comando muere con «unknown or unexpected option», sin aplicar nada y sin que se note.
--
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server (si no,
-- el cliente viejo en memoria sigue sin conocer la columna y las escrituras fallan en silencio).

ALTER TABLE "ProjectBrief" ADD COLUMN IF NOT EXISTS "narrativa" TEXT;
