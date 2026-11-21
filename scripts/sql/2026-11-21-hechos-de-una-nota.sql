-- 2026-11-21 · «Hablar con Nexus»: la nota que una persona del equipo le cuenta a Nexus deja HECHOS, como una reunión.
--
-- Tres columnas nuevas en "HechoDeReunion", todas nullable (inocuas para el código viejo, que no las lee ni las escribe):
--   "exploracionId" — la preventa donde se guardó la nota (FK, borrar la preventa borra sus hechos de notas).
--   "notaClave"     — la nota de «Lo que sabes del cliente» de la que sale (`sabido:<id>`, contenido.notas).
--   "dichoPorEmail" — quién lo dijo, del equipo: el hecho lleva «lo dijo <persona>» en vez de la cita del cliente.
-- Y el CHECK de dónde sale un hecho suma la nota: de una reunión, de un texto sumado a mano (la cola) o de una nota del
-- equipo. Es MÁS permisivo que el de antes (lo que valía sigue valiendo); se rehace con DROP IF EXISTS + ADD.
-- Una nota va siempre con su preventa y con quién la dijo (CHECK nuevo).
-- El escritor es el de siempre: lib/seguimiento/hechos-server.ts (`escribirHechosDeUnaNota`).
--
-- Se puede correr dos veces. Va ANTES del deploy del código que la usa.
--
-- Volver atrás (con revisión; borra los hechos de notas):
--   DELETE FROM "HechoDeReunion" WHERE "notaClave" IS NOT NULL;
--   ALTER TABLE "HechoDeReunion" DROP CONSTRAINT IF EXISTS "HechoDeReunion_nota_con_su_preventa";
--   ALTER TABLE "HechoDeReunion" DROP CONSTRAINT IF EXISTS "HechoDeReunion_reunion_o_lectura";
--   ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_reunion_o_lectura" CHECK (num_nonnulls("sessionId", "lecturaId") >= 1);
--   ALTER TABLE "HechoDeReunion" DROP COLUMN IF EXISTS "exploracionId", DROP COLUMN IF EXISTS "notaClave", DROP COLUMN IF EXISTS "dichoPorEmail";
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-11-21-hechos-de-una-nota.sql; Remove-Item Env:ALLOW_PROD_WRITE

ALTER TABLE "HechoDeReunion" ADD COLUMN IF NOT EXISTS "exploracionId" TEXT;
ALTER TABLE "HechoDeReunion" ADD COLUMN IF NOT EXISTS "notaClave" TEXT;
ALTER TABLE "HechoDeReunion" ADD COLUMN IF NOT EXISTS "dichoPorEmail" TEXT;

CREATE INDEX IF NOT EXISTS "HechoDeReunion_exploracionId_notaClave_idx" ON "HechoDeReunion" ("exploracionId", "notaClave");

DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_exploracionId_fkey"
    FOREIGN KEY ("exploracionId") REFERENCES "ExploracionDeVenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un hecho sale de una reunión, de un texto sumado a mano o de una nota del equipo: nunca de la nada.
ALTER TABLE "HechoDeReunion" DROP CONSTRAINT IF EXISTS "HechoDeReunion_reunion_o_lectura";
ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_reunion_o_lectura"
  CHECK (num_nonnulls("sessionId", "lecturaId", "notaClave") >= 1);

-- La nota va con su preventa y con quién la dijo.
DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_nota_con_su_preventa"
    CHECK ("notaClave" IS NULL OR ("exploracionId" IS NOT NULL AND "dichoPorEmail" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
