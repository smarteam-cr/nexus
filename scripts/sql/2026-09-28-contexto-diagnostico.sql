-- 2026-09-28 · «Contexto del diagnóstico»: qué reuniones alimentan al diagnóstico y notas propias.
--
-- Pedido de Elías: que cada documento (diagnóstico, planificación, implementación) tenga su espacio
-- de contexto como el cronograma, para que quede claro qué sesiones lo alimentan. A diferencia del
-- cronograma, el del diagnóstico arranca SUGERIDO: toda reunión del proyecto con el cliente entra, y
-- el CSE saca o agrega.
--
-- ADITIVO: 1 columna nullable + 1 tabla. Nada se dropea ni se renombra, y no hace falta backfill:
-- `diagnosisOverride` en NULL = «sigue la sugerencia».
--
-- ⛔ ORDEN: esto va ANTES del deploy. El código nuevo SELECCIONA `diagnosisOverride` en cada lectura
-- de vínculos sesión↔proyecto: si el deploy llega primero, revientan la ficha del cliente, el
-- cronograma y el clasificador (INV7) — el mismo incidente que el 2026-09-23.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-09-28-contexto-diagnostico.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe y el comando muere sin aplicar nada.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.
-- NUNCA `prisma db push`.

-- (a) El afinado del DIAGNÓSTICO por vínculo, hermano de `timelineOverride`:
--     NULL = sugerida (alimenta si es con el cliente) · true = agregada a mano · false = la X.
ALTER TABLE "SessionProject" ADD COLUMN IF NOT EXISTS "diagnosisOverride" BOOLEAN;

-- (b) Las notas del contexto de un DOCUMENTO, genérica por `pieza` (slug del registro). Cuelgan del
--     PROYECTO: sobreviven a borrar y regenerar el documento.
CREATE TABLE IF NOT EXISTS "NotaDeContexto" (
  "id"             TEXT NOT NULL,
  "projectId"      TEXT NOT NULL,
  "pieza"          TEXT NOT NULL,
  "title"          TEXT,
  "content"        TEXT NOT NULL,
  "createdByEmail" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "NotaDeContexto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NotaDeContexto_projectId_pieza_createdAt_idx"
  ON "NotaDeContexto" ("projectId", "pieza", "createdAt");

DO $$ BEGIN
  ALTER TABLE "NotaDeContexto" ADD CONSTRAINT "NotaDeContexto_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- OBLIGATORIO: Supabase le da SELECT a `anon` sobre todo `public`, y las notas pueden traer
-- transcripciones del cliente. RLS sin ninguna policy = nadie la lee con la clave pública; Nexus
-- entra con el rol del servidor, que no pasa por RLS.
ALTER TABLE "NotaDeContexto" ENABLE ROW LEVEL SECURITY;
