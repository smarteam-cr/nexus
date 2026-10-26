-- 2026-10-27 · El análisis de la venta consultiva, en la preventa: S4, la autoevaluación de cada sesión
-- (docs/analizador-reuniones-venta-plan.md › «El rediseño de Elías (2026-10-26)»).
--
-- Por qué: el análisis de cada reunión (S3) es una PROPUESTA de coaching. En S4 el vendedor lo comenta o discrepa y una
-- persona lo confirma; lo confirmado alimenta la guía de la siguiente sesión y la tendencia de cada vendedor (S7). Se
-- guarda en la misma fila del análisis:
--   · "comentarios"         — JSONB, la lista de comentarios del vendedor (`ComentarioDelAnalisis[]`,
--                              lib/analizador-venta/revision.ts): quién, cuándo, si comenta o discrepa, y sobre qué punto;
--   · "confirmadoPor"       — el correo de quien lo confirmó; null = sigue siendo propuesta;
--   · "confirmadoAt"        — cuándo;
--   · "notaDeConfirmacion"  — lo que dijo al confirmar, si dijo algo;
--   · "paraLaProxima"       — JSONB, `string[]`: lo que la persona confirmó para la próxima sesión.
-- Volver a analizar la reunión borra la confirmación (el análisis es otro); los comentarios se quedan con su fecha.
-- Las escribe SOLO lib/analizador-venta/ (revision-server.ts y analizar-server.ts). INV62 vigila que un análisis
-- confirmado tenga quién, cuándo y resultado.
--
-- ADITIVO: 5 columnas nullable en una tabla que ya existe. Nada se dropea, nada se renombra. Inocuo con el código viejo
-- corriendo. Se puede correr dos veces.
--
-- ⚠ ORDEN: va DESPUÉS de 2026-10-26-analizador-venta.sql (crea la tabla) y ANTES del deploy. Sin él, `/api/health`
-- responde 503 y el deploy se revierte solo.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-27-analisis-de-venta.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⛔ NUNCA `prisma db push`.

ALTER TABLE "AnalisisDeVenta" ADD COLUMN IF NOT EXISTS "comentarios"        JSONB;
ALTER TABLE "AnalisisDeVenta" ADD COLUMN IF NOT EXISTS "confirmadoPor"      TEXT;
ALTER TABLE "AnalisisDeVenta" ADD COLUMN IF NOT EXISTS "confirmadoAt"       TIMESTAMP(3);
ALTER TABLE "AnalisisDeVenta" ADD COLUMN IF NOT EXISTS "notaDeConfirmacion" TEXT;
ALTER TABLE "AnalisisDeVenta" ADD COLUMN IF NOT EXISTS "paraLaProxima"      JSONB;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- La tabla ya lo tiene desde 2026-10-26-analizador-venta.sql; se vuelve a afirmar (idempotente): los comentarios son
-- juicios sobre el equipo y citas de conversaciones con clientes.
ALTER TABLE "AnalisisDeVenta" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "AnalisisDeVenta";
CREATE POLICY deny_all_non_superuser ON "AnalisisDeVenta" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'AnalisisDeVenta' ORDER BY ordinal_position;
