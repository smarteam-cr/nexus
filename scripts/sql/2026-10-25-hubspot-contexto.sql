-- 2026-10-25 · HubSpot como contexto y como aviso (área U de docs/roadmap.md: U7, U9, U10 y B3 etapa 1; plan en
-- docs/integracion-hubspot-plan.md).
--
-- Por qué:
--   · U7: los resúmenes de Notetaker de las reuniones (759) y las llamadas (566) de HubSpot no entraban. Las reuniones
--     van a `ComunicacionDeHubspot` con el tipo nuevo «reunion»; las dos columnas nuevas guardan con qué reunión de
--     Meet se cruza (el evento de Google Calendar y el código de Meet), para no duplicar las que ya llegan por Meet.
--   · U10: los avisos de HubSpot (webhooks) se guardan en `EventoDeHubspot` y se procesan en el job, nunca en la ruta.
--   · U9: las fusiones de HubSpot quedan en `FusionDeHubspot` (el id absorbido y el que sobrevive). HubSpot no marca nada
--     más: el id viejo sigue respondiendo con los datos del sobreviviente.
--   · B3 etapa 1: los leads de HubSpot de las empresas de Nexus, en `LeadDeHubspot` (solo lectura, como los contactos).
--
-- ADITIVO: 2 columnas nullable y 3 tablas nuevas. El CHECK del tipo de comunicación se AMPLÍA (se suma «reunion»):
-- se borra y se vuelve a crear con un valor más; ninguna fila existente deja de cumplirlo.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce los modelos)
-- y el deploy se revierte solo. Se puede correr dos veces.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-25-hubspot-contexto.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`.

-- ── U7 · La reunión de HubSpot y con qué reunión de Meet se cruza ─────────────────────────────────────────────────
ALTER TABLE "ComunicacionDeHubspot" ADD COLUMN IF NOT EXISTS "googleEventId" TEXT;
ALTER TABLE "ComunicacionDeHubspot" ADD COLUMN IF NOT EXISTS "codigoDeMeet" TEXT;

ALTER TABLE "ComunicacionDeHubspot" DROP CONSTRAINT IF EXISTS "ComunicacionDeHubspot_tipo_valido";
ALTER TABLE "ComunicacionDeHubspot" ADD CONSTRAINT "ComunicacionDeHubspot_tipo_valido"
  CHECK ("tipo" IN ('correo', 'nota', 'llamada', 'reunion'));

-- ── U10 · Los avisos de HubSpot (webhooks) ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EventoDeHubspot" (
  "id"           TEXT NOT NULL,
  "clave"        TEXT NOT NULL,
  "objeto"       TEXT NOT NULL,
  "tipo"         TEXT NOT NULL,
  "hubspotId"    TEXT NOT NULL,
  "propiedad"    TEXT,
  "valor"        TEXT,
  "idsFusionados" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "idSobreviviente" TEXT,
  "ocurrioAt"    TIMESTAMP(3) NOT NULL,
  "recibidoAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "estado"       TEXT NOT NULL DEFAULT 'pendiente',
  "intentos"     INTEGER NOT NULL DEFAULT 0,
  "procesadoAt"  TIMESTAMP(3),
  "error"        TEXT,
  CONSTRAINT "EventoDeHubspot_pkey" PRIMARY KEY ("id")
);

-- HubSpot reintenta hasta 10 veces en 24 horas: el mismo aviso llega más de una vez y se guarda una.
CREATE UNIQUE INDEX IF NOT EXISTS "EventoDeHubspot_clave_key" ON "EventoDeHubspot" ("clave");
-- El job: los pendientes, del más viejo al más nuevo.
CREATE INDEX IF NOT EXISTS "EventoDeHubspot_estado_recibidoAt_idx" ON "EventoDeHubspot" ("estado", "recibidoAt");

DO $$ BEGIN
  ALTER TABLE "EventoDeHubspot" ADD CONSTRAINT "EventoDeHubspot_estado_valido"
    CHECK ("estado" IN ('pendiente', 'procesado', 'ignorado', 'error'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "EventoDeHubspot" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "EventoDeHubspot";
CREATE POLICY deny_all_non_superuser ON "EventoDeHubspot" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── U9 · Las fusiones de HubSpot ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "FusionDeHubspot" (
  "id"              TEXT NOT NULL,
  "objeto"          TEXT NOT NULL,
  "idAbsorbido"     TEXT NOT NULL,
  "idSobreviviente" TEXT NOT NULL,
  "vistaAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FusionDeHubspot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FusionDeHubspot_objeto_idAbsorbido_key" ON "FusionDeHubspot" ("objeto", "idAbsorbido");
CREATE INDEX IF NOT EXISTS "FusionDeHubspot_objeto_idSobreviviente_idx" ON "FusionDeHubspot" ("objeto", "idSobreviviente");

DO $$ BEGIN
  ALTER TABLE "FusionDeHubspot" ADD CONSTRAINT "FusionDeHubspot_objeto_valido"
    CHECK ("objeto" IN ('empresa', 'contacto', 'negocio', 'proyecto', 'ticket'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "FusionDeHubspot" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "FusionDeHubspot";
CREATE POLICY deny_all_non_superuser ON "FusionDeHubspot" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── B3 etapa 1 · Los leads de HubSpot ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "LeadDeHubspot" (
  "id"                  TEXT NOT NULL,
  "clientId"            TEXT NOT NULL,
  "hubspotId"           TEXT NOT NULL,
  "nombre"              TEXT NOT NULL,
  "pipeline"            TEXT,
  "etapaId"             TEXT,
  "etapa"               TEXT,
  "etapaCategoria"      TEXT,
  "tipoDeLead"          TEXT,
  "origen"              TEXT,
  "duenoEmail"          TEXT,
  "contactoHubspotId"   TEXT,
  "creadoEnHubspot"     TIMESTAMP(3),
  "modificadoEnHubspot" TIMESTAMP(3),
  "huella"              TEXT NOT NULL,
  "vigente"             BOOLEAN NOT NULL DEFAULT true,
  "copiadoAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadDeHubspot_pkey" PRIMARY KEY ("id")
);

-- Un lead es UNA fila (de un solo cliente: invariante 1).
CREATE UNIQUE INDEX IF NOT EXISTS "LeadDeHubspot_hubspotId_key" ON "LeadDeHubspot" ("hubspotId");
CREATE INDEX IF NOT EXISTS "LeadDeHubspot_clientId_vigente_idx" ON "LeadDeHubspot" ("clientId", "vigente");

DO $$ BEGIN
  ALTER TABLE "LeadDeHubspot" ADD CONSTRAINT "LeadDeHubspot_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "LeadDeHubspot" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "LeadDeHubspot";
CREATE POLICY deny_all_non_superuser ON "LeadDeHubspot" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado recién aplicado: rowsecurity = true en las tres.
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('EventoDeHubspot', 'FusionDeHubspot', 'LeadDeHubspot');
