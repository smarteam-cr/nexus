-- 2026-10-02 · El ESTADO del diagnóstico: borrador, presentado y aprobado por el cliente.
--
-- Por qué: el flujo real (Caroline Bersot, Alex Vanegas, Elías) es: se presenta el diagnóstico, el
-- cliente agrega cosas que no había contado, esa sesión se suma al contexto y se regenera conservando
-- el historial, y Caroline pide la aprobación formal por correo antes de pasar a planificación. Nexus
-- no tenía estado de documento: ni qué versión vio el cliente, ni quién la aprobó.
--
--   · "ProjectCanvas"."estadoDocumento"  — null = borrador · 'presentado' · 'aprobado'.
--   · "ProjectCanvas"."versionDocumento" — la vN que se trabaja o se presenta.
--   · "VersionDeDocumento"."protegida"   — la foto de lo presentado/aprobado: no la borra el tope de
--     30 versiones ni se salta por igual a la anterior.
--   · "HitoDeDocumento"                  — el historial (presentado, aprobado con su evidencia y la
--     nota en HubSpot, reabierto con su motivo). Solo se inserta.
--
-- ADITIVO: dos columnas en ProjectCanvas, una en VersionDeDocumento y una tabla nueva. Nada se borra
-- ni se renombra. Tipos como TEXT y no enum (misma decisión que INV4).
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, el cliente de Prisma nuevo pide columnas que no
-- existen y fallan las lecturas de los documentos de proyecto (ProjectCanvas se lee en todas partes).
--
-- Correr (PowerShell, en tu PC):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-02-estado-del-documento.sql
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`: droppearía columnas (regla dual-PC, schema.prisma).

ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "estadoDocumento" TEXT;
ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "versionDocumento" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "VersionDeDocumento" ADD COLUMN IF NOT EXISTS "protegida" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "HitoDeDocumento" (
  "id"                   TEXT NOT NULL,
  "canvasId"             TEXT NOT NULL,
  "version"              INTEGER NOT NULL,
  "tipo"                 TEXT NOT NULL,
  "porEmail"             TEXT,
  "fotoId"               TEXT,
  "aprobadoPorNombre"    TEXT,
  "aprobadoPorEmail"     TEXT,
  "aprobadoEl"           TIMESTAMP(3),
  "evidencia"            TEXT,
  "evidenciaDocumentoId" TEXT,
  "hubspotNotaId"        TEXT,
  "hubspotError"         TEXT,
  "motivo"               TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HitoDeDocumento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "HitoDeDocumento_canvasId_createdAt_idx" ON "HitoDeDocumento" ("canvasId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "HitoDeDocumento" ADD CONSTRAINT "HitoDeDocumento_canvasId_fkey"
    FOREIGN KEY ("canvasId") REFERENCES "ProjectCanvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "HitoDeDocumento" ADD CONSTRAINT "HitoDeDocumento_fotoId_fkey"
    FOREIGN KEY ("fotoId") REFERENCES "VersionDeDocumento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- Como el resto de Nexus: RLS encendido y cerrado para anon/authenticated (la evidencia de una
-- aprobación es un correo del cliente). `postgres` (Prisma) tiene BYPASSRLS y sigue igual.
ALTER TABLE "HitoDeDocumento" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "HitoDeDocumento";
CREATE POLICY deny_all_non_superuser ON "HitoDeDocumento" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado: 2 | 1 | 0 y rowsecurity = true.
--   SELECT (SELECT count(*) FROM information_schema.columns WHERE table_name = 'ProjectCanvas'
--             AND column_name IN ('estadoDocumento', 'versionDocumento')) AS columnas_canvas,
--          (SELECT count(*) FROM information_schema.columns WHERE table_name = 'VersionDeDocumento'
--             AND column_name = 'protegida') AS columna_version,
--          (SELECT count(*) FROM "HitoDeDocumento") AS hitos;
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'HitoDeDocumento';
