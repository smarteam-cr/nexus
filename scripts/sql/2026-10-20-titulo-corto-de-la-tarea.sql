-- 2026-10-20 · El nombre corto de cada tarea, para nombrarla fuera de Tareas (decisión de Elías).
--
-- Por qué: en «Para ti» y en el calendario una tarea se nombra «Cayalá – Enviar propuesta a Priscila | Espacio
-- interno», no «T-180 · Preparar y enviar a Priscila la propuesta de…». El nombre corto lo escribe la IA (Haiku) con el
-- job «titulos-cortos» (lib/tareas/ia/titulo-corto-server.ts). `tituloCortoDe` guarda el título del que salió: si el
-- título cambia (a mano, por HubSpot o por el chat), el job lo vuelve a escribir sin que ningún escritor se entere.
--
-- ADITIVO: 2 columnas nullable en "Tarea". Nada se dropea, nada se renombra. Se puede correr dos veces.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce las columnas)
-- y el deploy se revierte solo.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-20-titulo-corto-de-la-tarea.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⛔ NUNCA `prisma db push`.

ALTER TABLE "Tarea" ADD COLUMN IF NOT EXISTS "tituloCorto" TEXT;
ALTER TABLE "Tarea" ADD COLUMN IF NOT EXISTS "tituloCortoDe" TEXT;

DO $$ BEGIN
  ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_tituloCorto_corto" CHECK ("tituloCorto" IS NULL OR length("tituloCorto") BETWEEN 1 AND 80);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
