-- 2026-10-16 · Contactos y tickets de HubSpot en Nexus (etapa 6a de docs/mi-dia-plan.md).
--
-- Por qué: Nexus no sabe quiénes son las personas del cliente ni qué problemas tiene abiertos. El resumen antes de cada
-- reunión (etapa 4c) necesita saber quién viene y con qué cargo, y la cuenta tiene que mostrar los tickets abiertos.
-- Una copia de SOLO LECTURA, cada hora y solo de las empresas que están en Nexus (job `contactos-y-tickets`). Nexus no
-- escribe contactos ni tickets en HubSpot.
--
-- Dos tablas, una fila por registro y cliente (un contacto de dos empresas de Nexus está en las dos). Ninguna se borra:
-- lo que la empresa deja de tener asociado queda `vigente = false`.
--
-- ADITIVO: 2 tablas nuevas. Nada se dropea, nada se renombra, ninguna tabla existente cambia.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce los
-- modelos) y el deploy se revierte solo.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-16-contactos-y-tickets.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`.

CREATE TABLE IF NOT EXISTS "ContactoDeHubspot" (
  "id"                TEXT NOT NULL,
  "clientId"          TEXT NOT NULL,
  "hubspotId"         TEXT NOT NULL,
  "nombre"            TEXT NOT NULL,
  "email"             TEXT,
  "cargo"             TEXT,
  "duenoEmail"        TEXT,
  "ultimoContactoAt"  TIMESTAMP(3),
  "ultimaActividadAt" TIMESTAMP(3),
  "creadoEnHubspot"   TIMESTAMP(3),
  "vigente"           BOOLEAN NOT NULL DEFAULT true,
  "copiadoAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactoDeHubspot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContactoDeHubspot_clientId_hubspotId_key"
  ON "ContactoDeHubspot" ("clientId", "hubspotId");

-- Quién vino a una reunión: se cruza por el correo de los invitados.
CREATE INDEX IF NOT EXISTS "ContactoDeHubspot_email_idx"
  ON "ContactoDeHubspot" ("email");

DO $$ BEGIN
  ALTER TABLE "ContactoDeHubspot" ADD CONSTRAINT "ContactoDeHubspot_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "TicketDeHubspot" (
  "id"                  TEXT NOT NULL,
  "clientId"            TEXT NOT NULL,
  "hubspotId"           TEXT NOT NULL,
  "asunto"              TEXT NOT NULL,
  "pipeline"            TEXT,
  "etapa"               TEXT,
  "abierto"             BOOLEAN NOT NULL,
  "prioridad"           TEXT,
  "duenoEmail"          TEXT,
  "creadoEnHubspot"     TIMESTAMP(3),
  "cerradoEnHubspot"    TIMESTAMP(3),
  "modificadoEnHubspot" TIMESTAMP(3),
  "vigente"             BOOLEAN NOT NULL DEFAULT true,
  "copiadoAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketDeHubspot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TicketDeHubspot_clientId_hubspotId_key"
  ON "TicketDeHubspot" ("clientId", "hubspotId");

CREATE INDEX IF NOT EXISTS "TicketDeHubspot_clientId_abierto_idx"
  ON "TicketDeHubspot" ("clientId", "abierto");

DO $$ BEGIN
  ALTER TABLE "TicketDeHubspot" ADD CONSTRAINT "TicketDeHubspot_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`: sin esto, los nombres, correos y
-- cargos de las personas de los clientes serían leíbles con la clave pública que viaja en el navegador. RLS sin policy
-- SELECT = cerrado; la RESTRICTIVE lo mantiene cerrado aunque alguien sume mañana una policy permisiva.
ALTER TABLE "ContactoDeHubspot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TicketDeHubspot" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "ContactoDeHubspot";
CREATE POLICY deny_all_non_superuser ON "ContactoDeHubspot" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "TicketDeHubspot";
CREATE POLICY deny_all_non_superuser ON "TicketDeHubspot" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado recién aplicado: las dos con rowsecurity = true.
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('ContactoDeHubspot', 'TicketDeHubspot');
