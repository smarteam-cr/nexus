-- 2026-09-26 · Cuestionario previo: el Google Sheets que el CSE mandaba al cierre del kickoff, en Nexus.
--
-- Pedido de Elías (2026-09-25): un cuestionario por proyecto, armado por los hubs del proyecto, que
-- cada responsable del cliente contesta en SU pestaña con su propio enlace, que no pierde lo escrito,
-- que se bloquea al enviar (y deja registro de los cambios que se piden después) y que admite
-- documentos con «qué es este documento». Las respuestas alimentan Exploración y Planificación.
--
-- ADITIVO: 4 tablas nuevas + 2 columnas nullable en ClientDocument. Nada se dropea ni se renombra,
-- y no hace falta backfill: sin filas, todo se comporta como hoy.
--
-- ⛔ ORDEN: esto va ANTES del deploy. El código nuevo lee `ClientDocument.descripcion` y la tabla
-- `Cuestionario` al generar Exploración: si el deploy llega primero, la generación revienta.
--
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-26-cuestionario-previo.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe y el comando muere sin aplicar nada.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.
-- NUNCA `prisma db push`.

CREATE TABLE IF NOT EXISTS "Cuestionario" (
  "id"          TEXT NOT NULL,
  "projectId"   TEXT NOT NULL,
  "publicadoAt" TIMESTAMP(3),
  "cerradoAt"   TIMESTAMP(3),
  "prellenandoDesde" TIMESTAMP(3),
  "prellenadoAt"     TIMESTAMP(3),
  "prellenadoError"  TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Cuestionario_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Cuestionario_projectId_key" ON "Cuestionario" ("projectId");
-- Idempotente también sobre una base que corrió una versión previa de este archivo (la local).
ALTER TABLE "Cuestionario" ADD COLUMN IF NOT EXISTS "prellenandoDesde" TIMESTAMP(3);
ALTER TABLE "Cuestionario" ADD COLUMN IF NOT EXISTS "prellenadoAt" TIMESTAMP(3);
ALTER TABLE "Cuestionario" ADD COLUMN IF NOT EXISTS "prellenadoError" TEXT;

CREATE TABLE IF NOT EXISTS "CuestionarioResponsable" (
  "id"             TEXT NOT NULL,
  "cuestionarioId" TEXT NOT NULL,
  "nombre"         TEXT NOT NULL,
  "cargo"          TEXT,
  "email"          TEXT,
  "accessToken"    TEXT NOT NULL,
  "revokedAt"      TIMESTAMP(3),
  "ultimoUsoAt"    TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CuestionarioResponsable_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CuestionarioResponsable_accessToken_key"
  ON "CuestionarioResponsable" ("accessToken");
CREATE INDEX IF NOT EXISTS "CuestionarioResponsable_cuestionarioId_idx"
  ON "CuestionarioResponsable" ("cuestionarioId");

CREATE TABLE IF NOT EXISTS "CuestionarioPestana" (
  "id"                   TEXT NOT NULL,
  "cuestionarioId"       TEXT NOT NULL,
  "key"                  TEXT NOT NULL,
  "titulo"               TEXT NOT NULL,
  "descripcion"          TEXT,
  "orden"                INTEGER NOT NULL DEFAULT 0,
  "tipo"                 TEXT NOT NULL DEFAULT 'normal',
  "preguntas"            JSONB NOT NULL DEFAULT '[]',
  "respuestas"           JSONB NOT NULL DEFAULT '{}',
  "etapas"               JSONB NOT NULL DEFAULT '[]',
  "contextoAdicional"    TEXT,
  "responsableId"        TEXT,
  "enviadaAt"            TIMESTAMP(3),
  "clienteActualizadoAt" TIMESTAMP(3),
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CuestionarioPestana_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CuestionarioPestana_cuestionarioId_key_key"
  ON "CuestionarioPestana" ("cuestionarioId", "key");
CREATE INDEX IF NOT EXISTS "CuestionarioPestana_responsableId_idx"
  ON "CuestionarioPestana" ("responsableId");

CREATE TABLE IF NOT EXISTS "CuestionarioCambio" (
  "id"             TEXT NOT NULL,
  "cuestionarioId" TEXT NOT NULL,
  "pestanaId"      TEXT,
  "responsableId"  TEXT,
  "tipo"           TEXT NOT NULL,
  "mensaje"        TEXT,
  "autorEmail"     TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CuestionarioCambio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CuestionarioCambio_cuestionarioId_createdAt_idx"
  ON "CuestionarioCambio" ("cuestionarioId", "createdAt");

ALTER TABLE "ClientDocument" ADD COLUMN IF NOT EXISTS "descripcion" TEXT;
ALTER TABLE "ClientDocument" ADD COLUMN IF NOT EXISTS "cuestionarioPestanaId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Cuestionario" ADD CONSTRAINT "Cuestionario_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CuestionarioResponsable" ADD CONSTRAINT "CuestionarioResponsable_cuestionarioId_fkey"
    FOREIGN KEY ("cuestionarioId") REFERENCES "Cuestionario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CuestionarioPestana" ADD CONSTRAINT "CuestionarioPestana_cuestionarioId_fkey"
    FOREIGN KEY ("cuestionarioId") REFERENCES "Cuestionario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CuestionarioPestana" ADD CONSTRAINT "CuestionarioPestana_responsableId_fkey"
    FOREIGN KEY ("responsableId") REFERENCES "CuestionarioResponsable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CuestionarioCambio" ADD CONSTRAINT "CuestionarioCambio_cuestionarioId_fkey"
    FOREIGN KEY ("cuestionarioId") REFERENCES "Cuestionario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CuestionarioCambio" ADD CONSTRAINT "CuestionarioCambio_pestanaId_fkey"
    FOREIGN KEY ("pestanaId") REFERENCES "CuestionarioPestana"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CuestionarioCambio" ADD CONSTRAINT "CuestionarioCambio_responsableId_fkey"
    FOREIGN KEY ("responsableId") REFERENCES "CuestionarioResponsable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ClientDocument" ADD CONSTRAINT "ClientDocument_cuestionarioPestanaId_fkey"
    FOREIGN KEY ("cuestionarioPestanaId") REFERENCES "CuestionarioPestana"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- OBLIGATORIO: Supabase le da SELECT a `anon` sobre todo `public`, y esto guarda lo que el cliente
-- cuenta de su operación + los tokens de sus enlaces. RLS sin ninguna policy = nadie lo lee con la
-- clave pública; Nexus entra con el rol del servidor, que no pasa por RLS.
ALTER TABLE "Cuestionario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CuestionarioResponsable" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CuestionarioPestana" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CuestionarioCambio" ENABLE ROW LEVEL SECURITY;
