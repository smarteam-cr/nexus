-- 2026-10-14 · Cuándo se le presenta cada documento al cliente: una sola pregunta para el kickoff, el diagnóstico, la
-- planificación y la entrega, que responde solo Customer Success.
--
-- Por qué: la pregunta del 2026-10-07 era solo del diagnóstico, se abría sola como un modal a cualquiera que pudiera
-- generarlo (también a dirección), no dejaba decir «Ya lo presenté» y guardaba solo la última respuesta en
-- `Project.diagnosticoPresentacion`, sin la historia de quién respondió. Elías pidió: que la responda solo Customer
-- Success (el encargado del proyecto o quien generó el documento), para los cuatro documentos, y que quede registrado
-- quién respondió cada cosa.
--
--   · "PresentacionDeDocumento" — APPEND-ONLY: cada respuesta es una fila (una fecha, «Todavía no sé», «Ya lo
--     presenté», «Está listo», «Ahora no») y también la fecha que leyó Nexus en una reunión. Nada se edita ni se borra:
--     el estado de cada documento es el resultado de leer sus filas en orden (lib/presentaciones/reglas.ts). Lleva
--     congelados el nombre del proyecto y de la empresa, para la exportación.
--
-- ⚠ Documento y evento van como TEXT con CHECK, no como enum (misma decisión que el feedback y los tiempos): sumar
-- uno pide cambiar el CHECK, no un ALTER TYPE.
--
-- ADITIVO: 1 tabla nueva. Nada se dropea, nada se renombra. `Project.diagnosticoPresentacion` queda sin lectores
-- (DEPRECATED); lo que tenga se pasa a esta tabla con scripts/migrar-presentacion-del-diagnostico.ts, después del deploy.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce el modelo) y el
-- deploy se revierte solo.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-14-presentaciones-de-documentos.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`: droppearía columnas (regla dual-PC, schema.prisma).

CREATE TABLE IF NOT EXISTS "PresentacionDeDocumento" (
  "id"             TEXT NOT NULL,
  "projectId"      TEXT,
  "proyectoNombre" TEXT NOT NULL,
  "clientNombre"   TEXT,
  "documento"      TEXT NOT NULL,
  "evento"         TEXT NOT NULL,
  "fecha"          TEXT,
  "porEmail"       TEXT,
  "rol"            TEXT,
  "motivo"         TEXT,
  "sessionId"      TEXT,
  "detalle"        JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PresentacionDeDocumento_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PresentacionDeDocumento_documento_valido"
    CHECK ("documento" IN ('kickoff', 'diagnostico', 'planificacion', 'entrega')),
  CONSTRAINT "PresentacionDeDocumento_evento_valido"
    CHECK ("evento" IN ('fecha', 'sin-fecha', 'presentado', 'listo', 'propuesta', 'descarte', 'ahora-no')),
  -- La fecha es AAAA-MM-DD (el día en Costa Rica), y la llevan los eventos que hablan de un día.
  CONSTRAINT "PresentacionDeDocumento_fecha_formato" CHECK ("fecha" IS NULL OR "fecha" ~ '^\d{4}-\d{2}-\d{2}$'),
  CONSTRAINT "PresentacionDeDocumento_fecha_si_hace_falta"
    CHECK (("evento" IN ('fecha', 'presentado', 'listo', 'propuesta', 'descarte')) = ("fecha" IS NOT NULL)),
  -- Lo que leyó Nexus en una reunión no lo responde nadie; todo lo demás lo responde una persona.
  CONSTRAINT "PresentacionDeDocumento_quien" CHECK (("evento" = 'propuesta') = ("porEmail" IS NULL)),
  -- Lo que leyó Nexus dice de qué reunión salió; nada más lleva reunión.
  CONSTRAINT "PresentacionDeDocumento_reunion" CHECK (("evento" = 'propuesta') = ("sessionId" IS NOT NULL))
);

-- El estado de un documento: sus filas en orden.
CREATE INDEX IF NOT EXISTS "PresentacionDeDocumento_projectId_documento_createdAt_idx"
  ON "PresentacionDeDocumento" ("projectId", "documento", "createdAt");

-- Lo que dejó una reunión («Lo que dejó esta reunión»).
CREATE INDEX IF NOT EXISTS "PresentacionDeDocumento_sessionId_idx"
  ON "PresentacionDeDocumento" ("sessionId");

-- La lista y la exportación, por período.
CREATE INDEX IF NOT EXISTS "PresentacionDeDocumento_createdAt_idx"
  ON "PresentacionDeDocumento" ("createdAt");

-- SET NULL: la respuesta sobrevive a que se borre el proyecto (los nombres quedan congelados).
DO $$ BEGIN
  ALTER TABLE "PresentacionDeDocumento" ADD CONSTRAINT "PresentacionDeDocumento_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`: sin esto, las fechas y quién las
-- respondió serían leíbles con la clave pública que viaja en el navegador. RLS sin policy SELECT = cerrado para `anon` y
-- `authenticated`; la RESTRICTIVE lo mantiene cerrado aunque alguien sume mañana una policy permisiva. `postgres`
-- (Prisma) tiene BYPASSRLS.
ALTER TABLE "PresentacionDeDocumento" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "PresentacionDeDocumento";
CREATE POLICY deny_all_non_superuser ON "PresentacionDeDocumento" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado recién aplicado: rowsecurity = true.
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'PresentacionDeDocumento';
