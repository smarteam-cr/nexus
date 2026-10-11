-- 2026-10-09 · Tareas internas: cada tarea que genera Nexus nace con su CONTEXTO.
--
-- Por qué: una propuesta que sale de una reunión o del chat traía solo un título («Revisar los copies»), y quien la
-- recibía no sabía para qué, para quién ni qué se esperaba. Elías: «Cada tarea que se genera debe tener una
-- descripción con contexto». Lo escribe Nexus al crearla (de las notas de la reunión, de la conversación o del chat) y
-- NO se edita: lo de la persona sigue en "notas". El de una reunión se ve con la regla de su cita
-- (lib/tareas/serializar.ts): quien estuvo, y quien la hace o la pidió si ve al cliente.
--
-- ⚠ El nombre del archivo lleva «tareas2» y no «tareas-…» a propósito: la base local aplica los SQL en orden
-- alfabético, y «tareas-» quedaría ANTES de «tareas.sql» (el guion va antes que el punto), sobre una tabla que todavía
-- no existe.
--
-- ⚠ 2026-10-09-tareas.sql ya trae la columna en su CREATE TABLE: en una base nueva esto no hace nada. Hace falta solo donde
-- tareas.sql corrió ANTES de traerla (las bases locales, la otra PC, o producción si se aplicó esa primera versión).
-- Correrlo igual no cuesta nada (ADD COLUMN IF NOT EXISTS).
--
-- ADITIVO: una columna nullable. Nada se dropea, nada se renombra.
--
-- ⚠ ORDEN: DESPUÉS de 2026-10-09-tareas.sql y ANTES del deploy que trae el código.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-09-tareas2-contexto.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA prisma db push: droppearía columnas (regla dual-PC, schema.prisma).

ALTER TABLE "Tarea" ADD COLUMN IF NOT EXISTS "contexto" TEXT;

-- Verificación (db execute no muestra filas; correr aparte si se quiere ver):
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'Tarea' AND column_name = 'contexto';
