-- 2026-10-18 · Las comunicaciones de HubSpot en el contexto de la cuenta (iniciativa B de docs/roadmap.md;
-- plan en docs/correos-en-el-contexto-plan.md).
--
-- Por qué: una minuta con fechas se le mandó al cliente por correo, la reunión que prometía nunca se agendó y el cliente
-- le escribió a Marco. Nexus lee las reuniones, pero no los correos ni el timeline de HubSpot. Esta tabla es la copia de
-- SOLO LECTURA de los correos (enviados y recibidos), las notas y las llamadas de las empresas de Nexus y de sus
-- contactos (job `comunicaciones-hubspot`, cada hora). Nexus no escribe nada en HubSpot.
--
-- Una fila por comunicación: es de UN cliente (invariante 1). Una que es de dos clientes no se guarda. Ninguna fila se
-- borra: lo que HubSpot deja de devolver queda `vigente = false`. De los correos enviados con una fecha o un
-- compromiso, `compromisosEstado` dice si ya se leyeron sus compromisos (cada correo se lee una vez).
--
-- ADITIVO: 1 tabla nueva. Nada se dropea, nada se renombra, ninguna tabla existente cambia. `Tarea.origen` es texto
-- sin CHECK: el valor nuevo «correo» no pide DDL.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce el modelo) y
-- el deploy se revierte solo. Se puede correr dos veces.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-18-comunicaciones-de-hubspot.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`.

CREATE TABLE IF NOT EXISTS "ComunicacionDeHubspot" (
  "id"                  TEXT NOT NULL,
  "clientId"            TEXT NOT NULL,
  "tipo"                TEXT NOT NULL,
  "hubspotId"           TEXT NOT NULL,
  "direccion"           TEXT,
  "ocurrioAt"           TIMESTAMP(3) NOT NULL,
  "asunto"              TEXT,
  "texto"               TEXT,
  "autorEmail"          TEXT,
  "deEmail"             TEXT,
  "huella"              TEXT NOT NULL,
  "modificadoEnHubspot" TIMESTAMP(3),
  "vigente"             BOOLEAN NOT NULL DEFAULT true,
  "compromisosEstado"   TEXT,
  "compromisosIntentos" INTEGER NOT NULL DEFAULT 0,
  "compromisosLeidoAt"  TIMESTAMP(3),
  "compromisosError"    TEXT,
  "copiadoAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComunicacionDeHubspot_pkey" PRIMARY KEY ("id")
);

-- Una comunicación de HubSpot es UNA fila (de un solo cliente).
CREATE UNIQUE INDEX IF NOT EXISTS "ComunicacionDeHubspot_tipo_hubspotId_key"
  ON "ComunicacionDeHubspot" ("tipo", "hubspotId");

-- La memoria y el chat: las más recientes de una cuenta.
CREATE INDEX IF NOT EXISTS "ComunicacionDeHubspot_clientId_ocurrioAt_idx"
  ON "ComunicacionDeHubspot" ("clientId", "ocurrioAt");

-- El job: los correos con compromisos por leer.
CREATE INDEX IF NOT EXISTS "ComunicacionDeHubspot_compromisosEstado_idx"
  ON "ComunicacionDeHubspot" ("compromisosEstado");

DO $$ BEGIN
  ALTER TABLE "ComunicacionDeHubspot" ADD CONSTRAINT "ComunicacionDeHubspot_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ComunicacionDeHubspot" ADD CONSTRAINT "ComunicacionDeHubspot_tipo_valido"
    CHECK ("tipo" IN ('correo', 'nota', 'llamada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ComunicacionDeHubspot" ADD CONSTRAINT "ComunicacionDeHubspot_direccion_valida"
    CHECK ("direccion" IS NULL OR "direccion" IN ('enviado', 'recibido'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ComunicacionDeHubspot" ADD CONSTRAINT "ComunicacionDeHubspot_compromisos_estado_valido"
    CHECK ("compromisosEstado" IS NULL OR "compromisosEstado" IN ('no_aplica', 'pendiente', 'leyendo', 'leido', 'error'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`: sin esto, los correos con los
-- clientes serían leíbles con la clave pública que viaja en el navegador. RLS sin policy SELECT = cerrado; la
-- RESTRICTIVE lo mantiene cerrado aunque alguien sume mañana una policy permisiva.
ALTER TABLE "ComunicacionDeHubspot" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "ComunicacionDeHubspot";
CREATE POLICY deny_all_non_superuser ON "ComunicacionDeHubspot" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado recién aplicado: rowsecurity = true.
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'ComunicacionDeHubspot';
