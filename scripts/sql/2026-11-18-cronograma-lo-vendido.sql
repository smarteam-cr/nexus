-- 2026-11-18 · El cronograma sale de lo vendido: las horas vendidas y las horas de cada tarea.
--
-- Por qué: RC Inmobiliaria · DocuSign. El proyecto sale de un contrato de horas (el Acuerdo Macro:
-- 20 horas al mes, y DocuSign ≈ 40 de ellas). Las semanas vendidas no alcanzan para decir si el plan
-- entra: hace falta comparar horas contra horas (Elías: «sí debería poder, pero debe avisar»).
--
--   · "ProjectTimeline"."horasVendidas"  — las horas vendidas para ESTE proyecto (un tercer límite, como
--                                          la fecha límite y las semanas vendidas). Lo confirma una persona;
--                                          la IA del handoff solo lo propone, con su cita.
--   · "TimelineTask"."horasEstimadas"    — las horas estimadas de una tarea. Las pone el detalle del
--                                          cronograma desde las actividades de los casos de uso vendidos.
--                                          La suma es lo que se compara contra las horas vendidas.
--
-- Pasarse AVISA y no bloquea nada. Regla y textos: lib/timeline/limites.ts.
--
-- ADITIVO: dos columnas nuevas que admiten NULL. Nada se dropea, nada se renombra, ningún dato existente
-- cambia. RLS no cambia: las dos tablas ya están cerradas. Se puede correr dos veces (IF NOT EXISTS).
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, el cliente de Prisma nuevo pide columnas que no existen y
-- falla la lectura del cronograma (y /api/health responde 503, así que deploy.sh revierte).
--
-- Correr (PowerShell, en tu PC):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-11-18-cronograma-lo-vendido.sql
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⛔ NUNCA `prisma db push`.

ALTER TABLE "ProjectTimeline" ADD COLUMN IF NOT EXISTS "horasVendidas" INTEGER;
ALTER TABLE "TimelineTask" ADD COLUMN IF NOT EXISTS "horasEstimadas" DOUBLE PRECISION;
