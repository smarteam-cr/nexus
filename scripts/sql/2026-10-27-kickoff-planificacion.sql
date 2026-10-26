-- 2026-10-27 · Noche 2, pieza 5: el kickoff con HubSpot Academy y el acceso al portal (Q), y los documentos de la
-- empresa que se comparten (R3 etapas 2 y 3).
--
-- POR QUÉ. Q1: la ruta de HubSpot Academy de cada kickoff sale de un catálogo de listas que mantiene Smarteam (nombre,
-- enlace, hub, rol y duración). Q2: el proyecto guarda si el cliente ya nos dio acceso a su portal y cuándo, para avisarle
-- al CSE mientras falte y medir el criterio de éxito (dado en menos de 10 días hábiles). R3: un documento de la empresa
-- (sin proyecto) se le comparte a la empresa por un enlace propio, como la propuesta: la URL es el secreto. Decisión
-- completa: docs/DECISIONS.md › «El kickoff, la Planificación y los documentos de la empresa (noche 2)».
--
-- QUÉ ENTRA (ADITIVO: nada se dropea ni se renombra; se puede correr dos veces).
--   1. "ListaDeAcademy": el catálogo de listas de reproducción de HubSpot Academy. Nace vacío: lo llena el equipo en
--      Éxito del cliente › HubSpot Academy.
--   2. "Project"."accesoAlPortalDadoEn" y "accesoAlPortalMarcadoPor": el acceso al portal del cliente, marcado a mano.
--      Null = pendiente.
--   3. "AccesoAlDocumento": el enlace con que la empresa ve un documento suyo (sin proyecto). Uno por documento; revocable.
--      INV64 vigila que el enlace sea de la misma empresa que el documento.
--   Las tres tablas con RLS y sin policies (lock-down, ARCHITECTURE §4.5): solo Prisma las lee.
--
-- ⚠ ORDEN: ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce las columnas) y el deploy
-- se revierte solo.
--
-- Volver atrás (borra lo nuevo; con revisión):
--   DROP TABLE IF EXISTS "AccesoAlDocumento"; DROP TABLE IF EXISTS "ListaDeAcademy";
--   ALTER TABLE "Project" DROP COLUMN IF EXISTS "accesoAlPortalDadoEn", DROP COLUMN IF EXISTS "accesoAlPortalMarcadoPor";
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-27-kickoff-planificacion.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate + reiniciar el dev server · npm run check:invariants (INV64) · npm run check:esquema.
-- ⛔ NUNCA `prisma db push`.

-- ── 1. El catálogo de HubSpot Academy ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ListaDeAcademy" (
  "id"              TEXT NOT NULL,
  "nombre"          TEXT NOT NULL,
  "enlace"          TEXT NOT NULL,
  "hub"             TEXT NOT NULL DEFAULT 'general',
  "rol"             TEXT NOT NULL,
  "duracionMinutos" INTEGER,
  "descripcion"     TEXT,
  "orden"           INTEGER NOT NULL DEFAULT 0,
  "activa"          BOOLEAN NOT NULL DEFAULT true,
  "creadaPor"       TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ListaDeAcademy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ListaDeAcademy_activa_orden_idx" ON "ListaDeAcademy" ("activa", "orden");
DO $$
BEGIN
  -- Una duración negativa no existe; null = no se sabe.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ListaDeAcademy_duracion_rango') THEN
    ALTER TABLE "ListaDeAcademy" ADD CONSTRAINT "ListaDeAcademy_duracion_rango" CHECK ("duracionMinutos" IS NULL OR "duracionMinutos" >= 0);
  END IF;
END $$;
ALTER TABLE "ListaDeAcademy" ENABLE ROW LEVEL SECURITY;

-- ── 2. El acceso al portal del cliente ───────────────────────────────────────────────────────────
ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "accesoAlPortalDadoEn" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "accesoAlPortalMarcadoPor" TEXT;

-- ── 3. El enlace de un documento de la empresa ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AccesoAlDocumento" (
  "id"          TEXT NOT NULL,
  "canvasId"    TEXT NOT NULL,
  "clientId"    TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "enabledAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt"   TIMESTAMP(3),
  "lastUsedAt"  TIMESTAMP(3),
  "creadoPor"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccesoAlDocumento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccesoAlDocumento_canvasId_key" ON "AccesoAlDocumento" ("canvasId");
CREATE UNIQUE INDEX IF NOT EXISTS "AccesoAlDocumento_accessToken_key" ON "AccesoAlDocumento" ("accessToken");
CREATE INDEX IF NOT EXISTS "AccesoAlDocumento_clientId_idx" ON "AccesoAlDocumento" ("clientId");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccesoAlDocumento_canvasId_fkey') THEN
    ALTER TABLE "AccesoAlDocumento" ADD CONSTRAINT "AccesoAlDocumento_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "ProjectCanvas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccesoAlDocumento_clientId_fkey') THEN
    ALTER TABLE "AccesoAlDocumento" ADD CONSTRAINT "AccesoAlDocumento_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "AccesoAlDocumento" ENABLE ROW LEVEL SECURITY;
