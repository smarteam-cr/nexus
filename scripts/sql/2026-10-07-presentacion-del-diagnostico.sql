-- 2026-10-07 — Cuándo se le presenta el diagnóstico al cliente (Elías).
--
-- Al generar el diagnóstico, Nexus pregunta cuándo se planea presentar; si una reunión lo menciona,
-- lo propone con la frase de la reunión. Cuando se acerca la fecha, el CSE confirma que está listo y
-- le llega un aviso al vendedor. Todo vive en un Json con versión (lib/canvas/presentacion-del-diagnostico.ts):
--   { v, fecha, fijadaPor, fijadaEn, fuente, sinFecha, propuesta, descartadas, listo, aviso }
--
-- SOLO ADITIVO e inocuo para el código anterior (que no lee esta columna). Re-ejecutable.
-- Aplicar ANTES del deploy:
--   $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-07-presentacion-del-diagnostico.sql; Remove-Item Env:ALLOW_PROD_WRITE

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "diagnosticoPresentacion" JSONB;
