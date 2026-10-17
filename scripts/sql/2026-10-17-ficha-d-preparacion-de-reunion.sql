-- 2026-10-17 · Ficha D (el inicio de Ventas y del CSE): lo que una persona prepara antes de una reunión.
--
-- Por qué: en el inicio («Para ti»), tocar una reunión de la agenda abre su panel con su objetivo. Nexus propone el
-- objetivo con los datos de la cuenta (el siguiente paso, el negocio, lo que debe el cliente); la persona lo puede
-- cambiar y anotar lo que quiere preguntar. Eso se guarda acá: una fila por persona y evento de Google Calendar. Lo ve
-- solo esa persona.
--
-- ADITIVO: 1 tabla nueva. Nada se dropea, nada se renombra, ninguna tabla existente cambia. Se puede correr dos veces.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce el modelo)
-- y el deploy se revierte solo.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-17-ficha-d-preparacion-de-reunion.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`.

CREATE TABLE IF NOT EXISTS "PreparacionDeReunion" (
  "id"           TEXT NOT NULL,
  "personaEmail" TEXT NOT NULL,
  "eventoId"     TEXT NOT NULL,
  "objetivo"     TEXT,
  "notas"        TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PreparacionDeReunion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PreparacionDeReunion_evento_corto" CHECK (length("eventoId") BETWEEN 1 AND 300),
  CONSTRAINT "PreparacionDeReunion_objetivo_corto" CHECK ("objetivo" IS NULL OR length("objetivo") <= 500),
  CONSTRAINT "PreparacionDeReunion_notas_cortas" CHECK ("notas" IS NULL OR length("notas") <= 5000)
);

-- Una fila por persona y evento.
CREATE UNIQUE INDEX IF NOT EXISTS "PreparacionDeReunion_personaEmail_eventoId_key"
  ON "PreparacionDeReunion" ("personaEmail", "eventoId");

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`: sin esto, las notas de cada persona
-- serían leíbles con la clave pública que viaja en el navegador. RLS sin policy SELECT = cerrado; la RESTRICTIVE lo
-- mantiene cerrado aunque alguien sume mañana una policy permisiva. `postgres` (Prisma) tiene BYPASSRLS.
ALTER TABLE "PreparacionDeReunion" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "PreparacionDeReunion";
CREATE POLICY deny_all_non_superuser ON "PreparacionDeReunion" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado recién aplicado: rowsecurity = true.
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'PreparacionDeReunion';
