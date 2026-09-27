-- 2026-09-27 · La sección del handoff gana un resumen corto de «¿qué se vendió?».
--
-- Aditivas y nullable: los ~75 handoffs ya generados quedan con `handoffResumen` en NULL y la
-- pantalla ofrece el botón «Generar resumen» en su lugar. Nada que backfillear — el resumen nace
-- en la próxima corrida del handoff, o cuando alguien aprieta ese botón.
--
-- ⛔ ORDEN OBLIGATORIO: esto se aplica ANTES del deploy. El código nuevo SELECCIONA las columnas
-- (`app/api/projects/[projectId]/handoff/route.ts`), así que si el deploy llega primero, la
-- sección de handoff de CUALQUIER proyecto revienta contra Postgres — es el incidente de
-- `closeDateOverride` (Tanda M), byte por byte.
--
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-27-handoff-resumen.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe (la conexión sale de prisma.config.ts) y
-- el comando muere con «unknown or unexpected option», sin aplicar nada y sin que se note.
--
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server (si no,
-- el cliente viejo en memoria sigue sin conocer las columnas y las escrituras fallan en silencio).

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "handoffResumen" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "handoffResumenAt" TIMESTAMP(3);
