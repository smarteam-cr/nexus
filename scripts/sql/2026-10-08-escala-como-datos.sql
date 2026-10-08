-- 2026-10-08 · La Escala de Rendimiento como DATOS: cada versión, su borrador y la bitácora de cambios.
--
-- Por qué: pedido de Elías (2026-10-08) — la escala deja de ser un archivo `.md` del repo. Vive en la
-- base como datos (áreas, capas, dimensiones, niveles, criterios, ediciones) y el `.md` se GENERA
-- desde ellos. Es el primer paso antes de la mejora grande de la escala: editarla en Nexus (los super
-- admin), ver qué cambió y por qué, y publicar una versión nueva sin pasar por un archivo
-- (docs/escala/plan-escala-como-datos.md). Dos tablas:
--
--   · "EscalaVersion" — cada versión de la escala como datos (JSONB con la estructura entera,
--     lib/escala/datos/tipos.ts). `estado` = 'borrador' (uno solo a la vez; se edita) o 'publicada'
--     (congelada: no cambia nunca). `huella` = sha256 del `.md` que generan los datos.
--   · "EscalaCambio" — la bitácora del borrador: cada cambio anclado a lo que tocó (`1.7.F1`, `1.7.F`,
--     `1.7`, una edición o una sección de texto), con el antes y el después, quién y cuándo, y el
--     reporte de Feedback que lo originó si lo hay.
--
-- "EscalaDocumento" NO cambia: sigue guardando el `.md` de cada versión publicada (ahora generado
-- desde los datos) y es lo que leen las pantallas y lo que se descarga. Nadie nota el cambio.
--
-- ⚠ Estados y tipos van como TEXT y no como enum (misma decisión que INV4): los fija
-- lib/escala/datos/reglas.ts.
--
-- ADITIVO: 2 tablas nuevas. Nada se dropea, nada se renombra, ninguna tabla existente cambia. La FK
-- a "FeedbackReporte" va con ON DELETE SET NULL (borrar un reporte no borra el cambio).
-- RE-EJECUTABLE: la base local lo reaplica en cada bootstrap.
--
-- ⛔ ORDEN: este SQL va ANTES del deploy. El cliente Prisma nuevo trae los dos modelos: sin las
-- tablas, /api/health responde 503 (chequeo de esquema) y deploy.sh revierte.
-- Después del SQL, una vez: pasar la 8.7.0 publicada a datos —
--   $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/escala-datos.ts migrar --apply
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-08-escala-como-datos.sql
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`: droppearía columnas (regla dual-PC, schema.prisma).

CREATE TABLE IF NOT EXISTS "EscalaVersion" (
  "id"                  TEXT NOT NULL,
  "version"             TEXT NOT NULL,
  "estado"              TEXT NOT NULL,
  "formato"             INTEGER NOT NULL,
  "datos"               JSONB NOT NULL,
  "huella"              TEXT NOT NULL,
  "basadaEn"            TEXT,
  "revision"            INTEGER NOT NULL DEFAULT 0,
  "creadaEn"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "creadaPorEmail"      TEXT,
  "actualizadaEn"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadaPorEmail" TEXT,
  "publicadaEn"         TIMESTAMP(3),
  "publicadaPorEmail"   TEXT,
  CONSTRAINT "EscalaVersion_pkey" PRIMARY KEY ("id")
);

-- Una versión existe UNA vez (borrador o publicada).
CREATE UNIQUE INDEX IF NOT EXISTS "EscalaVersion_version_key"
  ON "EscalaVersion" ("version");

-- Un solo borrador a la vez: dos borradores se pisarían los cambios.
CREATE UNIQUE INDEX IF NOT EXISTS "EscalaVersion_un_borrador"
  ON "EscalaVersion" ("estado") WHERE "estado" = 'borrador';

-- «La última publicada».
CREATE INDEX IF NOT EXISTS "EscalaVersion_estado_publicadaEn_idx"
  ON "EscalaVersion" ("estado", "publicadaEn");

CREATE TABLE IF NOT EXISTS "EscalaCambio" (
  "id"          TEXT NOT NULL,
  "versionId"   TEXT NOT NULL,
  "ancla"       TEXT NOT NULL,
  "tipoDeAncla" TEXT NOT NULL,
  "accion"      TEXT NOT NULL,
  "campo"       TEXT,
  "antes"       TEXT,
  "despues"     TEXT,
  "origen"      TEXT NOT NULL,
  "lote"        TEXT,
  "nota"        TEXT,
  "feedbackId"  TEXT,
  "autorEmail"  TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EscalaCambio_pkey" PRIMARY KEY ("id")
);

-- La bitácora de una versión, en orden.
CREATE INDEX IF NOT EXISTS "EscalaCambio_versionId_createdAt_idx"
  ON "EscalaCambio" ("versionId", "createdAt");

-- «Qué cambió en ESTE criterio», entre versiones.
CREATE INDEX IF NOT EXISTS "EscalaCambio_ancla_idx"
  ON "EscalaCambio" ("ancla");

-- CASCADE: descartar un borrador se lleva su bitácora (una publicada no se borra nunca).
DO $$ BEGIN
  ALTER TABLE "EscalaCambio" ADD CONSTRAINT "EscalaCambio_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "EscalaVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EscalaCambio" ADD CONSTRAINT "EscalaCambio_feedbackId_fkey"
    FOREIGN KEY ("feedbackId") REFERENCES "FeedbackReporte"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`: sin esto, la
-- escala en edición y su bitácora serían leíbles con la clave pública que viaja en el navegador.
-- RLS sin policy SELECT = cerrado para `anon` y `authenticated`; la RESTRICTIVE lo mantiene cerrado
-- aunque alguien sume mañana una policy permisiva. `postgres` (Prisma) tiene BYPASSRLS.
ALTER TABLE "EscalaVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EscalaCambio" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "EscalaVersion";
CREATE POLICY deny_all_non_superuser ON "EscalaVersion" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "EscalaCambio";
CREATE POLICY deny_all_non_superuser ON "EscalaCambio" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado recién aplicado: 0 | 0, y las dos con rowsecurity = true.
--   SELECT (SELECT COUNT(*) FROM "EscalaVersion") AS versiones,
--          (SELECT COUNT(*) FROM "EscalaCambio") AS cambios;
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('EscalaVersion', 'EscalaCambio');
