-- 2026-09-23 · «Contexto del cronograma»: qué reuniones alimentan al cronograma y notas propias.
--
-- Pedido de Elías: clonar el módulo de Contexto del handoff para el CRONOGRAMA — que el CSE elija
-- las reuniones que alimentan fases y tareas y pueda pegar notas a mano. Sin la columna de HubSpot.
--
-- ADITIVO: 1 columna nullable + 1 tabla. Nada se dropea ni se renombra, y no hace falta backfill:
-- `timelineOverride` en NULL = «sigue la regla» = el comportamiento de hoy (toda reunión del
-- proyecto alimenta al cronograma).
--
-- ⛔ ORDEN: esto va ANTES del deploy. El código nuevo SELECCIONA `timelineOverride` en cada lectura
-- de vínculos sesión↔proyecto: si el deploy llega primero, revientan la ficha del cliente, el
-- cronograma y el clasificador (INV7).
--
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-23-contexto-cronograma.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe y el comando muere sin aplicar nada.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.
-- NUNCA `prisma db push`.

-- (a) El afinado del CRONOGRAMA por vínculo, hermano de `handoffOverride`:
--     NULL = sigue la regla (alimenta) · true = agregada a mano · false = la X (sale SOLO del
--     cronograma; sigue siendo del proyecto para el handoff, la Entrega y las minutas).
ALTER TABLE "SessionProject" ADD COLUMN IF NOT EXISTS "timelineOverride" BOOLEAN;

-- (b) Las notas manuales del cronograma. Tabla PROPIA y no `HandoffSource`: esa la leen el handoff,
--     el mapeo de procesos de TODO el cliente y el conteo que habilita generar el handoff, y ninguno
--     filtra por tipo — una nota del cronograma se habría colado en los tres.
--     Cuelgan del PROYECTO y no del cronograma: sobreviven a borrarlo y regenerarlo.
CREATE TABLE IF NOT EXISTS "TimelineSource" (
  "id"             TEXT NOT NULL,
  "projectId"      TEXT NOT NULL,
  "title"          TEXT,
  "content"        TEXT NOT NULL,
  "createdByEmail" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "TimelineSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TimelineSource_projectId_createdAt_idx"
  ON "TimelineSource" ("projectId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "TimelineSource" ADD CONSTRAINT "TimelineSource_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- OBLIGATORIO: Supabase le da SELECT a `anon` sobre todo `public`, y las notas pueden traer
-- transcripciones del cliente. RLS sin ninguna policy = nadie la lee con la clave pública; Nexus
-- entra con el rol del servidor, que no pasa por RLS.
ALTER TABLE "TimelineSource" ENABLE ROW LEVEL SECURITY;
