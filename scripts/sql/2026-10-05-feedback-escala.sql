-- 2026-10-05 · Los comentarios de la escala pasan a ser reportes de Feedback.
--
-- Por qué: Elías unió los dos módulos («es mejor que todo se maneje desde el módulo de feedback
-- nuevo»). Lo que el equipo comenta sobre un criterio, un nivel o una dimensión de la escala se sigue
-- escribiendo EN LA ESCALA, pero se guarda como un reporte de "FeedbackReporte" y se decide en la
-- bandeja de /feedback. Al reporte le faltaba dónde se ancla en la escala:
--
--   · "escalaAncla" — el identificador comentado («2.6.F1»). NULL = un reporte de pantalla.
--   · "escalaArea"  — su área («2»): los contadores de la escala cuentan por área y por ancla.
--   · "escala"      — lo demás (JSON): versión, texto leído, edición, tipo propio, cliente, perfil,
--                     «qué decisión cambiaría» y la fila de «Cambios pendientes» del manual.
--
-- ADITIVO: tres columnas y dos índices en una tabla que nace cerrada (RLS + RESTRICTIVE en
-- 2026-10-04-feedback.sql). Nada se dropea ni se renombra. Re-ejecutable.
-- Las tablas viejas ("EscalaComentario", "EscalaRespuesta") quedan como estaban: en producción están
-- vacías (0 comentarios al 2026-10-05), así que no hay nada que mover.
--
-- ⚠ ORDEN: después de 2026-10-04-feedback.sql y ANTES del deploy. Sin él, la escala se lee igual pero
-- no se puede comentar (lo dice la pantalla).
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-05-feedback-escala.sql
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⛔ NUNCA `prisma db push`: droppearía columnas (regla dual-PC, schema.prisma).

ALTER TABLE "FeedbackReporte" ADD COLUMN IF NOT EXISTS "escalaAncla" TEXT;
ALTER TABLE "FeedbackReporte" ADD COLUMN IF NOT EXISTS "escalaArea" TEXT;
ALTER TABLE "FeedbackReporte" ADD COLUMN IF NOT EXISTS "escala" JSONB;

CREATE INDEX IF NOT EXISTS "FeedbackReporte_escalaArea_idx" ON "FeedbackReporte" ("escalaArea");
CREATE INDEX IF NOT EXISTS "FeedbackReporte_escalaAncla_idx" ON "FeedbackReporte" ("escalaAncla");
