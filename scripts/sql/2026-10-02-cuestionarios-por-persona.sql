-- 2026-10-02 · Cuestionarios por PERSONA y por TIPO (pedido de Elías, plan aprobado el 2026-10-02).
--
-- Antes: UN cuestionario por proyecto, con sus pestañas repartidas entre responsables.
-- Ahora: varios cuestionarios por proyecto; cada uno es de UNA persona y de un TIPO
-- («tactico» = el de hoy, «escala» = el de la escala de rendimiento). Cada persona tiene UN enlace
-- que le muestra todos sus cuestionarios.
--
-- La tabla `CuestionarioResponsable` pasa a ser la PERSONA del proyecto (se conserva el nombre de la
-- tabla y sus tokens: los enlaces ya entregados siguen funcionando). `CuestionarioPestana.responsableId`
-- queda en la base sin uso (no se dropea nada: todo es reversible).
--
-- DATOS: cada cuestionario existente se reparte. Si todas sus pestañas son de una sola persona, el
-- cuestionario pasa a ser de esa persona; si tiene pestañas de varias, se crea un cuestionario por
-- persona y cada una se lleva sus pestañas (con respuestas, adjuntos y registro). Las pestañas sin
-- persona quedan en el original, sin persona asignada. Idempotente: correrlo dos veces no duplica.
--
-- ⛔ ORDEN: ANTES del deploy. El código nuevo lee `Cuestionario.tipo` y `personaId`.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-02-cuestionarios-por-persona.sql
--
-- ⚠ SIN `--schema`. Después, en la máquina de desarrollo: `npx prisma generate`. NUNCA `prisma db push`.

-- (a) Varios cuestionarios por proyecto.
DROP INDEX IF EXISTS "Cuestionario_projectId_key";
CREATE INDEX IF NOT EXISTS "Cuestionario_projectId_idx" ON "Cuestionario" ("projectId");

ALTER TABLE "Cuestionario" ADD COLUMN IF NOT EXISTS "tipo" TEXT NOT NULL DEFAULT 'tactico';
ALTER TABLE "Cuestionario" ADD COLUMN IF NOT EXISTS "personaId" TEXT;
-- Cuestionario de escala: la versión con la que se ARMÓ queda congelada (la escala sigue cambiando).
ALTER TABLE "Cuestionario" ADD COLUMN IF NOT EXISTS "escalaVersion" TEXT;
ALTER TABLE "Cuestionario" ADD COLUMN IF NOT EXISTS "escalaHuella" TEXT;
ALTER TABLE "Cuestionario" ADD COLUMN IF NOT EXISTS "edicion" TEXT;
-- Perfil de negocio de la escala ({cierre, despues}); null = se pregunta al principio.
ALTER TABLE "Cuestionario" ADD COLUMN IF NOT EXISTS "perfil" JSONB;
CREATE INDEX IF NOT EXISTS "Cuestionario_personaId_idx" ON "Cuestionario" ("personaId");

-- (b) La persona cuelga del PROYECTO, no de un cuestionario.
ALTER TABLE "CuestionarioResponsable" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
UPDATE "CuestionarioResponsable" r
   SET "projectId" = c."projectId"
  FROM "Cuestionario" c
 WHERE r."cuestionarioId" = c."id" AND r."projectId" IS NULL;
ALTER TABLE "CuestionarioResponsable" ALTER COLUMN "cuestionarioId" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "CuestionarioResponsable_projectId_idx" ON "CuestionarioResponsable" ("projectId");

-- Borrar un cuestionario ya NO puede borrar a la persona (antes era CASCADE).
ALTER TABLE "CuestionarioResponsable" DROP CONSTRAINT IF EXISTS "CuestionarioResponsable_cuestionarioId_fkey";
DO $$ BEGIN
  ALTER TABLE "CuestionarioResponsable" ADD CONSTRAINT "CuestionarioResponsable_cuestionarioId_fkey"
    FOREIGN KEY ("cuestionarioId") REFERENCES "Cuestionario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CuestionarioResponsable" ADD CONSTRAINT "CuestionarioResponsable_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Cuestionario" ADD CONSTRAINT "Cuestionario_personaId_fkey"
    FOREIGN KEY ("personaId") REFERENCES "CuestionarioResponsable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- (c) Repartir los cuestionarios existentes por persona.
DO $$
DECLARE
  c RECORD;
  r RECORD;
  personas INT;
  sueltas INT;
  nuevo TEXT;
BEGIN
  FOR c IN SELECT * FROM "Cuestionario" WHERE "personaId" IS NULL LOOP
    SELECT count(DISTINCT "responsableId") INTO personas
      FROM "CuestionarioPestana" WHERE "cuestionarioId" = c."id" AND "responsableId" IS NOT NULL;
    SELECT count(*) INTO sueltas
      FROM "CuestionarioPestana" WHERE "cuestionarioId" = c."id" AND "responsableId" IS NULL;

    IF personas = 0 THEN
      CONTINUE;
    END IF;

    IF personas = 1 AND sueltas = 0 THEN
      -- Todo es de una persona: el cuestionario pasa a ser suyo.
      UPDATE "Cuestionario" SET "personaId" = (
        SELECT "responsableId" FROM "CuestionarioPestana"
         WHERE "cuestionarioId" = c."id" AND "responsableId" IS NOT NULL LIMIT 1
      ) WHERE "id" = c."id";
      CONTINUE;
    END IF;

    -- Varias personas (o pestañas sin dueño): uno nuevo por persona, con sus pestañas.
    FOR r IN SELECT DISTINCT "responsableId" AS id FROM "CuestionarioPestana"
              WHERE "cuestionarioId" = c."id" AND "responsableId" IS NOT NULL LOOP
      nuevo := 'cq' || substr(md5(c."id" || r.id), 1, 23);
      INSERT INTO "Cuestionario" ("id", "projectId", "tipo", "personaId", "publicadoAt", "cerradoAt",
                                  "prellenadoAt", "createdById", "createdAt", "updatedAt")
      VALUES (nuevo, c."projectId", 'tactico', r.id, c."publicadoAt", c."cerradoAt",
              c."prellenadoAt", c."createdById", c."createdAt", now())
      ON CONFLICT ("id") DO NOTHING;
      UPDATE "CuestionarioCambio" SET "cuestionarioId" = nuevo
       WHERE "pestanaId" IN (SELECT "id" FROM "CuestionarioPestana"
                              WHERE "cuestionarioId" = c."id" AND "responsableId" = r.id);
      UPDATE "CuestionarioPestana" SET "cuestionarioId" = nuevo
       WHERE "cuestionarioId" = c."id" AND "responsableId" = r.id;
    END LOOP;

    -- Si el original quedó sin pestañas (todas tenían persona), no queda una cáscara vacía.
    DELETE FROM "Cuestionario" o
     WHERE o."id" = c."id"
       AND NOT EXISTS (SELECT 1 FROM "CuestionarioPestana" p WHERE p."cuestionarioId" = o."id")
       AND NOT EXISTS (SELECT 1 FROM "CuestionarioCambio" x WHERE x."cuestionarioId" = o."id");
  END LOOP;
END $$;
