-- 2026-10-16 · La acción única (fase 0.2 de docs/nexus-sistema-de-trabajo-plan.md).
--
-- ADITIVO y re-ejecutable. Va ANTES del deploy: el cliente Prisma del código nuevo pide estas columnas.
--
-- Una tarea es la unidad de «algo que hay que hacer» con una cuenta:
--   · suma su contacto y su negocio de HubSpot (ids externos) y el lado (quién se comprometió), que hasta hoy vivía en
--     el evento con que nació;
--   · una reunión planeada es una tarea de clase «reunion», con sus invitados, y queda unida a la reunión que se hizo;
--   · el siguiente paso de un equipo en una cuenta es su próxima tarea abierta con fecha. `SiguientePaso` pasa a ser la
--     copia de lo que está escrito en HubSpot, con la tarea de la que salió.

ALTER TABLE "Tarea" ADD COLUMN IF NOT EXISTS "hubspotContactId" TEXT;
ALTER TABLE "Tarea" ADD COLUMN IF NOT EXISTS "hubspotDealId" TEXT;
ALTER TABLE "Tarea" ADD COLUMN IF NOT EXISTS "lado" TEXT NOT NULL DEFAULT 'smarteam';
ALTER TABLE "Tarea" ADD COLUMN IF NOT EXISTS "clase" TEXT NOT NULL DEFAULT 'accion';
ALTER TABLE "Tarea" ADD COLUMN IF NOT EXISTS "invitados" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Tarea" ADD COLUMN IF NOT EXISTS "reunionInicio" TIMESTAMP(3);
ALTER TABLE "Tarea" ADD COLUMN IF NOT EXISTS "reunionHechaId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_lado_valido" CHECK ("lado" IN ('smarteam', 'cliente'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_clase_valida" CHECK ("clase" IN ('accion', 'reunion'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Tarea" ADD CONSTRAINT "Tarea_reunionHechaId_fkey"
    FOREIGN KEY ("reunionHechaId") REFERENCES "FirefliesSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Tarea_clientId_equipo_estado_idx" ON "Tarea"("clientId", "equipo", "estado");
CREATE INDEX IF NOT EXISTS "Tarea_hubspotContactId_idx" ON "Tarea"("hubspotContactId");
CREATE INDEX IF NOT EXISTS "Tarea_hubspotDealId_idx" ON "Tarea"("hubspotDealId");
CREATE INDEX IF NOT EXISTS "Tarea_reunionHechaId_idx" ON "Tarea"("reunionHechaId");

-- El lado de las tareas que ya existen sale del evento con que nacieron (lib/tareas/para-agentes.ts lo leía de ahí).
UPDATE "Tarea" t SET "lado" = 'cliente'
  FROM "TareaEvento" e
 WHERE e."tareaId" = t.id
   AND e."tipo" IN ('propuesta', 'creada')
   AND e."datos"->>'lado' = 'cliente'
   AND t."lado" = 'smarteam';

-- La copia de lo que está escrito en HubSpot recuerda la tarea de la que salió.
ALTER TABLE "SiguientePaso" ADD COLUMN IF NOT EXISTS "tareaId" TEXT;

DO $$ BEGIN
  ALTER TABLE "SiguientePaso" ADD CONSTRAINT "SiguientePaso_tareaId_fkey"
    FOREIGN KEY ("tareaId") REFERENCES "Tarea"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "SiguientePaso_tareaId_idx" ON "SiguientePaso"("tareaId");

-- Verificación: SELECT "lado", count(*) FROM "Tarea" GROUP BY 1;
