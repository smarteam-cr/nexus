-- 2026-10-10 · Memoria de la cuenta, etapa 6: los HECHOS que deja cada reunión.
--
-- Por qué: la ficha y la etapa vuelven a leer cada reunión con Haiku, el avance corre con cada reunión, y lo que una
-- reunión cambia en un documento nadie lo ve hasta regenerarlo. La lectura de cada reunión (etapa 2) deja, además de la
-- minuta, sus HECHOS: una frase con su cita literal verificada, de la cuenta o de un proyecto vinculado, con su tipo.
-- El código decide a dónde va cada uno (lib/seguimiento/enrutador.ts). Ver docs/DECISIONS.md «Hechos, enrutador y
-- novedades».
--
--   · "tipo"        cuenta | persona | acuerdo | resultado | proceso_hoy | queja | riesgo | senal_cronograma | senal_etapa
--   · "estado"      pendiente | usado | desestimado | vencido   (el general; «vencido» se calcula a los 30 días y no se
--                   escribe: está en el CHECK para el día en que haga falta guardarlo)
--   · "destinos"    [{ clave, estado: pendiente | usado | desestimado | delegado, ref?, decididoPorEmail?, decididoAt?, nota? }]
--                   «delegado» = su ciclo vive en el destino (la propuesta de ficha, la CsAlert, la etapa sugerida…)
--   · "mismoQueId"  el mismo hecho dicho antes, todavía pendiente (misma huella): no se vuelve a mandar a ningún lado
--   · "reemplazaAId" el acuerdo viejo que este reemplaza. Reemplazar lo confirma una persona (la pantalla de los
--                   acuerdos vigentes viene después); la columna va desde el primer día para no pedir otro ALTER.
--
-- El hecho se ata a la reunión (sessionId, CASCADE: si la reunión se borra, su memoria también) y a la fila de la cola
-- (lecturaId, SET NULL: la lectura de Tareas se puede rehacer o borrar sin perder lo aprendido). El estado de la llamada
-- de hechos vive en su AgentRun «seguimiento-hechos» (sourceSessionIds), como «procesos-lectura»: no se suman columnas a
-- LecturaDeReunion.
--
-- ADITIVO: 1 tabla nueva. Nada se dropea, nada se renombra, ninguna tabla existente cambia.
--
-- ⚠ ORDEN: DESPUÉS de 2026-10-09-tareas.sql (la FK a "LecturaDeReunion") y ANTES del deploy que trae el código. No
-- depende de 2026-10-10-lectura-de-seguimiento.sql (no usa sus columnas): puede ir antes o después, y
-- `npm run check:esquema` los lista por nombre, este primero. Sin la tabla, /api/health responde 503
-- (lib/db/salud-del-esquema.ts) y el deploy se revierte solo. Con la tabla y la bandera SEGUIMIENTO_HECHOS apagada
-- (vacía = apagada), nada la escribe.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-10-hechos-de-reunion.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server  +  npm run check:esquema en verde.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA prisma db push: droppearía columnas (regla dual-PC, schema.prisma).

CREATE TABLE IF NOT EXISTS "HechoDeReunion" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "lecturaId" TEXT,
    "agentRunId" TEXT,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "tipo" TEXT NOT NULL,
    "tema" TEXT,
    "frase" TEXT NOT NULL,
    "cita" TEXT NOT NULL,
    "citaFuente" TEXT NOT NULL,
    "quien" TEXT,
    "gravedad" TEXT,
    "huella" TEXT NOT NULL,
    "mismoQueId" TEXT,
    "reemplazaAId" TEXT,
    "destinos" JSONB NOT NULL DEFAULT '[]',
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "decididoPorEmail" TEXT,
    "decididoAt" TIMESTAMP(3),
    "nota" TEXT,
    "fechaDeLaReunion" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HechoDeReunion_pkey" PRIMARY KEY ("id")
);

-- Los valores (TEXT con CHECK: sumar uno no exige ALTER TYPE; los fija lib/seguimiento/hechos/tipos.ts).
DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_tipo"
    CHECK ("tipo" IN ('cuenta', 'persona', 'acuerdo', 'resultado', 'proceso_hoy', 'queja', 'riesgo', 'senal_cronograma', 'senal_etapa'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_estado"
    CHECK ("estado" IN ('pendiente', 'usado', 'desestimado', 'vencido'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_fuente"
    CHECK ("citaFuente" IN ('transcripcion', 'notas', 'texto'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_quien"
    CHECK ("quien" IS NULL OR "quien" IN ('cliente', 'smarteam'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_gravedad"
    CHECK ("gravedad" IS NULL OR "gravedad" IN ('baja', 'media', 'alta'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Un hecho sale de una reunión o de un texto sumado a mano (la fila de la cola): nunca de la nada.
DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_reunion_o_lectura"
    CHECK (num_nonnulls("sessionId", "lecturaId") >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_cita_largo"
    CHECK (char_length("cita") BETWEEN 12 AND 600);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Usado o desestimado ⇔ alguien lo decidió (una persona, o «sistema» cuando la reunión cambió de dueño).
DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_decidido"
    CHECK (("estado" IN ('usado', 'desestimado')) = ("decididoAt" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Un hecho no se reemplaza ni se repite a sí mismo.
DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_no_a_si_mismo"
    CHECK (("mismoQueId" IS NULL OR "mismoQueId" <> "id") AND ("reemplazaAId" IS NULL OR "reemplazaAId" <> "id"));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FKs (los nombres son los que pone Prisma: npm run check:esquema y migrate diff no ven ruido).
DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_lecturaId_fkey"
    FOREIGN KEY ("lecturaId") REFERENCES "LecturaDeReunion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_agentRunId_fkey"
    FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_mismoQueId_fkey"
    FOREIGN KEY ("mismoQueId") REFERENCES "HechoDeReunion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "HechoDeReunion" ADD CONSTRAINT "HechoDeReunion_reemplazaAId_fkey"
    FOREIGN KEY ("reemplazaAId") REFERENCES "HechoDeReunion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Índices
CREATE INDEX IF NOT EXISTS "HechoDeReunion_clientId_estado_createdAt_idx" ON "HechoDeReunion" ("clientId", "estado", "createdAt");
CREATE INDEX IF NOT EXISTS "HechoDeReunion_projectId_estado_idx" ON "HechoDeReunion" ("projectId", "estado");
CREATE INDEX IF NOT EXISTS "HechoDeReunion_sessionId_idx" ON "HechoDeReunion" ("sessionId");
CREATE INDEX IF NOT EXISTS "HechoDeReunion_lecturaId_idx" ON "HechoDeReunion" ("lecturaId");
CREATE INDEX IF NOT EXISTS "HechoDeReunion_agentRunId_idx" ON "HechoDeReunion" ("agentRunId");
CREATE INDEX IF NOT EXISTS "HechoDeReunion_clientId_huella_idx" ON "HechoDeReunion" ("clientId", "huella");
CREATE INDEX IF NOT EXISTS "HechoDeReunion_mismoQueId_idx" ON "HechoDeReunion" ("mismoQueId");
CREATE INDEX IF NOT EXISTS "HechoDeReunion_reemplazaAId_idx" ON "HechoDeReunion" ("reemplazaAId");

-- RLS ⚠ OBLIGATORIO: sin esto, las citas de las reuniones de los clientes serían leíbles con la publishable key del
-- bundle (ARCHITECTURE §4.5). Sin policy SELECT = cerrado para anon y authenticated; la RESTRICTIVE lo mantiene cerrado
-- aunque alguien sume una permisiva.
ALTER TABLE "HechoDeReunion" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "HechoDeReunion";
CREATE POLICY deny_all_non_superuser ON "HechoDeReunion" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- Verificación (solo lectura; db execute no muestra filas, correr aparte):
-- SELECT rowsecurity FROM pg_tables WHERE tablename = 'HechoDeReunion';                       -- true
-- SELECT polname, polpermissive FROM pg_policy WHERE polrelid = '"HechoDeReunion"'::regclass;  -- deny_all_non_superuser · false (RESTRICTIVE)
