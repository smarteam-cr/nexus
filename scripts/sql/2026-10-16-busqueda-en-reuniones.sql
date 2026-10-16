-- 2026-10-16 · La búsqueda de texto completo en las reuniones (etapa 4c de docs/mi-dia-plan.md).
--
-- Por qué: el resumen antes de una reunión tiene que poder citar la frase exacta de lo que se habló antes, y el CSE
-- tiene que poder buscar «¿qué dijo el cliente de la integración?» en todas las reuniones con esa empresa. Postgres
-- en español, sin servicio nuevo: la transcripción partida en TURNOS (quién habló y qué dijo), cada uno con su índice
-- de búsqueda. La búsqueda por significado (vectores) queda para después, solo si la de palabras se queda corta.
--
-- Dos tablas:
--   · "TurnoDeReunion"   — un turno de la transcripción. "tsv" es una columna GENERADA (no está en el schema de Prisma,
--     como `KnowledgeEmbedding.embedding`: `migrate diff` la muestra como ruido esperado). Se busca sin tildes: la
--     columna y la consulta pasan por el mismo `translate`.
--   · "ReunionIndexada"  — qué reuniones ya se partieron, con la huella de su transcripción: si cambia, se vuelve a
--     partir.
-- Las escribe SOLO lib/busqueda/indexar-server.ts (job `indice-de-reuniones` y scripts/indexar-reuniones.ts). Se
-- borran en cascada con su reunión.
--
-- ADITIVO: 2 tablas nuevas. Nada se dropea, nada se renombra, ninguna tabla existente cambia.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce los
-- modelos) y el deploy se revierte solo.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-16-busqueda-en-reuniones.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push` (dropearía "tsv").

CREATE TABLE IF NOT EXISTS "TurnoDeReunion" (
  "id"        TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "orden"     INTEGER NOT NULL,
  "hablante"  TEXT NOT NULL,
  "texto"     TEXT NOT NULL,
  "tsv"       tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'spanish'::regconfig,
      translate(lower("hablante" || ' ' || "texto"), 'áéíóúüàèìòù', 'aeiouuaeiou')
    )
  ) STORED,
  CONSTRAINT "TurnoDeReunion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TurnoDeReunion_sessionId_orden_key"
  ON "TurnoDeReunion" ("sessionId", "orden");

CREATE INDEX IF NOT EXISTS "TurnoDeReunion_tsv_idx"
  ON "TurnoDeReunion" USING GIN ("tsv");

DO $$ BEGIN
  ALTER TABLE "TurnoDeReunion" ADD CONSTRAINT "TurnoDeReunion_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ReunionIndexada" (
  "sessionId"  TEXT NOT NULL,
  "huella"     TEXT NOT NULL,
  "turnos"     INTEGER NOT NULL,
  "indexadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReunionIndexada_pkey" PRIMARY KEY ("sessionId")
);

DO $$ BEGIN
  ALTER TABLE "ReunionIndexada" ADD CONSTRAINT "ReunionIndexada_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — lo que dijo cada persona en cada reunión: cerrado para `anon` y `authenticated`. La RESTRICTIVE lo
-- mantiene cerrado aunque alguien sume mañana una policy permisiva.
ALTER TABLE "TurnoDeReunion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReunionIndexada" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "TurnoDeReunion";
CREATE POLICY deny_all_non_superuser ON "TurnoDeReunion" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "ReunionIndexada";
CREATE POLICY deny_all_non_superuser ON "ReunionIndexada" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('TurnoDeReunion', 'ReunionIndexada');
