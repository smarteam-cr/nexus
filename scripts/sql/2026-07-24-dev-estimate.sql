-- 2026-07-24 · DevEstimate — estimación de esfuerzo del equipo técnico (canvas Desarrollo)
--
-- ADITIVO: 1 tabla nueva + su índice + su FK. NO toca ninguna tabla existente.
--
-- HISTORIA (vale la pena leerla — es el patrón, no una anécdota):
-- Al escribir esta migración, `prisma migrate diff` mostraba que un `db push` ADEMÁS haría,
-- sin preguntar:
--     ALTER TABLE "AgentRun" DROP COLUMN "triggeredByEmail";
--     -- recrear CobranzaOrigenCobro SIN 'IMPORTACION'
--     -- recrear CobranzaTipoServicio SIN 'CONECTOR'
-- No era un problema de esta migración: era DERIVA VIVA de la otra PC (columnas y valores ya
-- aplicados a la DB que este `schema.prisma` todavía no conocía). Un `db push` los habría
-- BORRADO — el mismo caso que el DROP de `Particularidad.sourceQuote` cazado en la migración
-- de RoleProfile. Tras `git pull` (que trajo esos cambios de schema), el diff quedó limpio:
-- SOLO esta tabla. REGLA: correr `migrate diff` y LEERLO antes de tocar la DB; si trae
-- destructivo ajeno, pulleá primero y volvé a mirar — y si igual queda, SQL scoped a mano.
--
-- Se aplica igual por este archivo y no por `db:sync`, porque `db push` NO habilita RLS
-- (ver la línea del final, que es obligatoria).
--
-- Cómo aplicarlo (revisá antes de correr):
--   npx prisma db execute --file scripts/sql/2026-07-24-dev-estimate.sql --schema prisma/schema.prisma
-- Después:
--   npx prisma generate   (NO `db:sync` — eso corre db push)
--   reiniciar el dev server (el Prisma client viejo no entra por HMR)

BEGIN;

CREATE TABLE IF NOT EXISTS "DevEstimate" (
    "id"             TEXT NOT NULL,
    "projectId"      TEXT NOT NULL,
    "hours"          INTEGER,
    "estimatedDate"  TIMESTAMP(3),
    "note"           TEXT,
    "createdByEmail" TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevEstimate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DevEstimate_projectId_createdAt_idx"
    ON "DevEstimate"("projectId", "createdAt");

-- FK con CASCADE: borrar un proyecto se lleva sus estimaciones (no tienen vida propia).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DevEstimate_projectId_fkey'
  ) THEN
    ALTER TABLE "DevEstimate"
      ADD CONSTRAINT "DevEstimate_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ⚠ OBLIGATORIO — `db push` NO habilita RLS (recordatorio operativo de ARCHITECTURE §4.5).
-- Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`: sin esta línea, la tabla
-- sería leíble con la publishable key que viaja en el bundle del browser.
-- Sin policy SELECT = lock-down total (solo `postgres`/`service_role`, que bypassean RLS).
ALTER TABLE "DevEstimate" ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verificación (debe devolver rowsecurity = true):
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'DevEstimate';
