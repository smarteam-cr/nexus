-- 2026-10-19 · «Para ti»: el siguiente paso que Nexus sugiere con la reunión de una cuenta sin acción.
--
-- Por qué: una cuenta con su reunión de la semana en el calendario y sin el siguiente paso puesto casi siempre es un
-- problema de seteo (el paso existe, es esa reunión). Nexus sugiere dejar la reunión como el siguiente paso; la persona
-- la usa o la descarta. Lo descartado se guarda acá para no volver a mostrárselo (por persona y por evento).
--
-- ADITIVO: 1 tabla nueva. Nada se dropea, nada se renombra, ninguna tabla existente cambia. Se puede correr dos veces.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce el modelo)
-- y el deploy se revierte solo.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-19-sugerencias-descartadas.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`.

CREATE TABLE IF NOT EXISTS "SugerenciaDescartada" (
  "id"           TEXT NOT NULL,
  "personaEmail" TEXT NOT NULL,
  "tipo"         TEXT NOT NULL,
  "clave"        TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SugerenciaDescartada_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SugerenciaDescartada_tipo_corto" CHECK (length("tipo") BETWEEN 1 AND 80),
  CONSTRAINT "SugerenciaDescartada_clave_corta" CHECK (length("clave") BETWEEN 1 AND 400)
);

-- Una fila por persona, tipo y clave.
CREATE UNIQUE INDEX IF NOT EXISTS "SugerenciaDescartada_personaEmail_tipo_clave_key"
  ON "SugerenciaDescartada" ("personaEmail", "tipo", "clave");

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`. RLS sin policy SELECT = cerrado; la
-- RESTRICTIVE lo mantiene cerrado aunque alguien sume mañana una policy permisiva. `postgres` (Prisma) tiene BYPASSRLS.
ALTER TABLE "SugerenciaDescartada" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "SugerenciaDescartada";
CREATE POLICY deny_all_non_superuser ON "SugerenciaDescartada" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado recién aplicado: rowsecurity = true.
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'SugerenciaDescartada';
