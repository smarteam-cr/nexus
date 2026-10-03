-- 2026-10-02 · Los resultados medibles del handoff, capturados una sola vez.
--
-- Por qué: Elías pidió que los objetivos cuantitativos del diagnóstico vengan del resultado que ya
-- captura el handoff y no se capturen dos veces; si no hay línea base, se marcan «por validar». El
-- handoff guarda esos resultados como texto libre, así que se leen una vez y quedan como lista en el
-- proyecto (R1…: resultado, cómo se mide, línea base, meta, plazo). La escribe
-- lib/handoff/resultados.ts después de cada handoff, y el diagnóstico la muestra en sus objetivos.
--
-- ADITIVO: una columna nueva, nullable. Nada se borra ni se renombra.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, el cliente de Prisma nuevo pide una columna que no
-- existe y fallan las lecturas de `Project` que la traen (el diagnóstico y el handoff).
--
-- Correr (PowerShell, en tu PC):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-02-resultados-medibles-del-handoff.sql
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`: droppearía columnas (regla dual-PC, schema.prisma).

ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "handoffResultados" JSONB;

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'Project' AND column_name = 'handoffResultados';
