-- 2026-10-02 · Los límites acordados del cronograma: fecha límite y duración vendida.
--
-- Por qué: la validación del 2026-10-02 sobre los 50 cronogramas activos encontró que ni la fecha
-- en que el cliente necesita todo listo ni las semanas vendidas existían como dato, así que nada
-- podía compararse contra ellas. En 7 de las 14 cuentas donde el handoff nombraba la duración, el
-- plan que armó la IA se pasaba sin avisar (Club Amantes del Vino: vendido en 12 semanas, con
-- Salesforce venciendo el 31 de diciembre, cronograma hasta el 4 de enero).
--
--   · "fechaLimite"            — el día en que todo tiene que estar listo para el cliente.
--   · "duracionVendidaSemanas" — las semanas vendidas, SIN contar la Semana 0 (decisión de Elías).
--   · "limitesConfirmacion"    — quién confirmó cada uno (Ventas; si no, el CSL o el CSE), con su rol.
--   · "limitesPropuestos"      — lo que propuso la IA del handoff, con la frase de donde lo sacó.
--
-- Los escribe una persona (PATCH /api/projects/[projectId]/timeline/limites); la IA solo propone.
-- Mover uno ya confirmado pide motivo y con quién se acordó, y queda en "TimelineChange".
-- Pasarse AVISA y no bloquea nada. Regla y textos: lib/timeline/limites.ts.
--
-- ADITIVO: cuatro columnas nuevas que admiten NULL. Nada se dropea, nada se renombra, ningún dato
-- existente cambia (todos los cronogramas quedan sin límites hasta que alguien los confirme o la IA
-- los proponga al volver a correr el handoff). RLS no cambia: la tabla ya está cerrada.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, el cliente de Prisma nuevo pide columnas que no
-- existen y falla la lectura del cronograma (y /api/health responde 503, así que deploy.sh revierte).
--
-- Correr (PowerShell, en tu PC):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-02-limites-del-cronograma.sql
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`: droppearía columnas (regla dual-PC, schema.prisma).

ALTER TABLE "ProjectTimeline" ADD COLUMN IF NOT EXISTS "fechaLimite" TIMESTAMP(3);
ALTER TABLE "ProjectTimeline" ADD COLUMN IF NOT EXISTS "duracionVendidaSemanas" INTEGER;
ALTER TABLE "ProjectTimeline" ADD COLUMN IF NOT EXISTS "limitesConfirmacion" JSONB;
ALTER TABLE "ProjectTimeline" ADD COLUMN IF NOT EXISTS "limitesPropuestos" JSONB;

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'ProjectTimeline'
--      AND column_name IN ('fechaLimite', 'duracionVendidaSemanas', 'limitesConfirmacion', 'limitesPropuestos');
