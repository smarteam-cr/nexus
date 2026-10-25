-- 2026-10-26 · Área O del roadmap: los TESTS DEL DIAGNÓSTICO DE RENDIMIENTO dentro de Nexus (docs/tests-diagnostico-plan.md).
--
-- Por qué:
--   · "PreguntasDelTest" — el banco de preguntas de cada (área, versión, edición): el borrador que se edita (`preguntas`)
--     y la versión APROBADA que ve el público (`aprobadas`). Las aprueba Elías antes de publicarlas; sin aprobadas, el
--     test de esa área no se abre. `edicion` = 'general' para la escala general (no es nula: es parte de la llave).
--   · "IntentoDelTest" — cada intento de un prospecto: quién es, su empresa, las preguntas que vio (con su nivel, solo del
--     lado nuestro), lo que eligió, en qué pregunta va, el resultado que calculó Nexus y qué llegó a HubSpot. `token` es la
--     dirección pública del intento y de su resultado (256 bits, la URL es el secreto, como el cuestionario). `clientId`
--     = la empresa de Nexus por su dominio, si existe (SET NULL: borrar una empresa no borra los intentos).
-- Las lee y escribe SOLO lib/tests-diagnostico/repositorio-server.ts (por SQL: el cliente de Prisma no hace falta para
-- que el test funcione, y sin este SQL la página dice «todavía no está abierto» en vez de caerse).
--
-- ADITIVO: 2 tablas nuevas, sus índices y su RLS. Nada se dropea, nada se renombra. Inocuo con el código viejo corriendo.
-- Se puede correr dos veces.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy (el cliente Prisma ya conoce las tablas; sin ellas `/api/health` da 503).
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-26-tests-diagnostico.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⛔ NUNCA `prisma db push`.

CREATE TABLE IF NOT EXISTS "PreguntasDelTest" (
  "id"            TEXT NOT NULL,
  "area"          TEXT NOT NULL,
  "version"       TEXT NOT NULL,
  "edicion"       TEXT NOT NULL DEFAULT 'general',
  "escalaVersion" TEXT NOT NULL,
  "preguntas"     JSONB NOT NULL DEFAULT '[]',
  "aprobadas"     JSONB,
  "editadoPor"    TEXT,
  "aprobadoPor"   TEXT,
  "aprobadoAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreguntasDelTest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PreguntasDelTest_area_version_edicion_key" ON "PreguntasDelTest" ("area", "version", "edicion");

CREATE TABLE IF NOT EXISTS "IntentoDelTest" (
  "id"               TEXT NOT NULL,
  "token"            TEXT NOT NULL,
  "area"             TEXT NOT NULL,
  "version"          TEXT NOT NULL,
  "edicion"          TEXT,
  "escalaVersion"    TEXT NOT NULL,
  "preguntas"        JSONB NOT NULL DEFAULT '[]',
  "respuestas"       JSONB NOT NULL DEFAULT '{}',
  "paso"             INTEGER NOT NULL DEFAULT 0,
  "estado"           TEXT NOT NULL DEFAULT 'en_curso',
  "nombre"           TEXT NOT NULL,
  "email"            TEXT NOT NULL,
  "telefono"         TEXT,
  "puesto"           TEXT,
  "empresa"          TEXT,
  "dominio"          TEXT,
  "industria"        TEXT,
  "clientId"         TEXT,
  "resultado"        JSONB,
  "url"              TEXT,
  "origen"           JSONB,
  "hubspotFormAt"    TIMESTAMP(3),
  "hubspotNotaAt"    TIMESTAMP(3),
  "hubspotIntentos"  INTEGER NOT NULL DEFAULT 0,
  "hubspotError"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "terminadoAt"      TIMESTAMP(3),
  CONSTRAINT "IntentoDelTest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "IntentoDelTest_token_key" ON "IntentoDelTest" ("token");
CREATE INDEX IF NOT EXISTS "IntentoDelTest_clientId_idx" ON "IntentoDelTest" ("clientId");
CREATE INDEX IF NOT EXISTS "IntentoDelTest_dominio_idx" ON "IntentoDelTest" ("dominio");
CREATE INDEX IF NOT EXISTS "IntentoDelTest_estado_createdAt_idx" ON "IntentoDelTest" ("estado", "createdAt");

DO $$ BEGIN
  ALTER TABLE "IntentoDelTest"
    ADD CONSTRAINT "IntentoDelTest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS: lock-down total, como todas las tablas de public (ARCHITECTURE §4.5). Nadie lee estas tablas con la llave pública:
-- el prospecto llega por las rutas de Nexus, que leen con el rol del servidor.
ALTER TABLE "PreguntasDelTest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntentoDelTest" ENABLE ROW LEVEL SECURITY;
