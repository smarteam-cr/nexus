-- 2026-10-13 · Preguntas sobre la cuenta: lo que Customer Success sabe de cada cliente, preguntado al entrar.
--
-- Por qué: Elías quiere saber qué clientes tienen APERTURA A LA ASESORÍA (no solo piden cosas para implementar,
-- también quieren nuestra guía). Quien lo sabe es el CSE o la CSL que lleva la cuenta, y nadie lo anota. Al entrar a
-- la ficha de un cliente, Nexus le pregunta a cada persona de Customer Success; con «No sé», vuelve a preguntar la
-- primera vez que entra después de 7 días. Lo configura dirección en Feedback › Encuestas › Sobre los clientes.
-- Dos tablas:
--
--   · "EncuestaDeCuenta"  — una por pregunta del registro (lib/encuestas-de-cuenta/preguntas.ts): si está activa y
--     quién la cambió. Sin fila, vale lo que dice el registro (la primera nace activa).
--   · "RespuestaDeCuenta" — APPEND-ONLY: cada vez que se mostró, se respondió o se dejó para después, una fila. Nada se
--     edita ni se borra: una respuesta nueva no pisa la anterior, así se puede analizar cómo cambió la lectura de cada
--     cliente y de cada persona. Lleva congelados el texto y la versión de la pregunta y el nombre del cliente.
--
-- ⚠ Claves, eventos y respuestas van como TEXT y no como enum (misma decisión que el feedback y los tiempos): sumar
-- uno no debe exigir un ALTER TYPE. Los valores los fija `lib/encuestas-de-cuenta/` y los valida la API.
--
-- ADITIVO: 2 tablas nuevas. Nada se dropea, nada se renombra, ninguna tabla existente cambia.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce los
-- modelos) y el deploy se revierte solo.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-13-preguntas-sobre-la-cuenta.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`: droppearía columnas (regla dual-PC, schema.prisma).

CREATE TABLE IF NOT EXISTS "EncuestaDeCuenta" (
  "id"                  TEXT NOT NULL,
  "clave"               TEXT NOT NULL,
  "activa"              BOOLEAN NOT NULL DEFAULT true,
  "actualizadaPorEmail" TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EncuestaDeCuenta_pkey" PRIMARY KEY ("id")
);

-- Una fila por pregunta.
CREATE UNIQUE INDEX IF NOT EXISTS "EncuestaDeCuenta_clave_key"
  ON "EncuestaDeCuenta" ("clave");

CREATE TABLE IF NOT EXISTS "RespuestaDeCuenta" (
  "id"              TEXT NOT NULL,
  "clave"           TEXT NOT NULL,
  "preguntaVersion" INTEGER NOT NULL,
  "preguntaTexto"   TEXT NOT NULL,
  "clientId"        TEXT,
  "clientNombre"    TEXT NOT NULL,
  "personaEmail"    TEXT NOT NULL,
  "rol"             TEXT,
  "motivoDeAcceso"  TEXT,
  "evento"          TEXT NOT NULL,
  "valor"           TEXT,
  "porQue"          TEXT,
  "contexto"        JSONB,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RespuestaDeCuenta_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RespuestaDeCuenta_evento_valido" CHECK ("evento" IN ('mostrada', 'respondida', 'ahora_no')),
  -- Una respuesta lleva su valor; mostrarla o dejarla para después, no.
  CONSTRAINT "RespuestaDeCuenta_valor_si_respondida" CHECK (("evento" = 'respondida') = ("valor" IS NOT NULL)),
  CONSTRAINT "RespuestaDeCuenta_por_que_largo" CHECK ("porQue" IS NULL OR length("porQue") <= 1000)
);

-- ¿Le pregunto a esta persona por este cliente? Y la historia de una cuenta.
CREATE INDEX IF NOT EXISTS "RespuestaDeCuenta_clave_clientId_personaEmail_createdAt_idx"
  ON "RespuestaDeCuenta" ("clave", "clientId", "personaEmail", "createdAt");

-- Los resultados y la exportación, por período.
CREATE INDEX IF NOT EXISTS "RespuestaDeCuenta_clave_createdAt_idx"
  ON "RespuestaDeCuenta" ("clave", "createdAt");

-- SET NULL: la respuesta sobrevive a que se borre el cliente (el nombre queda congelado). La fusión de fichas la muda.
DO $$ BEGIN
  ALTER TABLE "RespuestaDeCuenta" ADD CONSTRAINT "RespuestaDeCuenta_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`: sin esto, lo que el equipo piensa de
-- cada cliente sería leíble con la clave pública que viaja en el navegador. RLS sin policy SELECT = cerrado para `anon`
-- y `authenticated`; la RESTRICTIVE lo mantiene cerrado aunque alguien sume mañana una policy permisiva. `postgres`
-- (Prisma) tiene BYPASSRLS.
ALTER TABLE "EncuestaDeCuenta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RespuestaDeCuenta" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "EncuestaDeCuenta";
CREATE POLICY deny_all_non_superuser ON "EncuestaDeCuenta" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "RespuestaDeCuenta";
CREATE POLICY deny_all_non_superuser ON "RespuestaDeCuenta" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado recién aplicado: las dos con rowsecurity = true.
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('EncuestaDeCuenta', 'RespuestaDeCuenta');
