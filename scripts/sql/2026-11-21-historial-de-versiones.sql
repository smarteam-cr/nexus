-- 2026-11-21 · Historial de versiones: un mismo historial para todo documento de Nexus.
--
-- Pedido de Elías (21 nov): «Volver a la versión anterior» del Resumen de La escala guardaba una sola versión atrás.
-- Quiere un historial estándar para todos los documentos, en un popup: cuál es la actual, cuál ve el cliente, una
-- vista previa y «Usar esta versión». Decisión en docs/DECISIONS.md › «Historial de versiones».
--
-- Se ensancha la tabla que ya guardaba las fotos de los canvases (VersionDeDocumento, 2026-09-28) en vez de crear otra:
-- su tope de 30 y su «protegida» ya existen.
--   · `canvasId` pasa a ser opcional y se suma `exploracionId` (el Resumen de La escala). Exactamente uno de los dos
--     (CHECK), como ProjectCanvas con sus dueños. El cronograma no guarda aquí: su historial ya existe
--     (TimelineChange y TimelineBaseline) y el popup lo lee de ahí.
--   · `contenido`: la foto de lo que no es un canvas (el Resumen). Los canvases siguen en `secciones`.
--   · `tipo`: cómo nació la versión (ia · edicion · publicado · restaurado · presentado · congelado · guardada).
--     null en las filas de antes: la pantalla lo deduce de `origen`.
--   · `publicada`: es lo que se le publicó al cliente. La última con true es «Lo que ve el cliente».
--
-- ADITIVO e inocuo para el código que corre hoy: escribe `canvasId` y `secciones` como siempre; las columnas nuevas
-- tienen default o aceptan null. Se puede correr dos veces.
--
-- ⛔ ORDEN: ANTES del deploy del código que las usa.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-11-21-historial-de-versiones.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.

ALTER TABLE "VersionDeDocumento" ALTER COLUMN "canvasId" DROP NOT NULL;

ALTER TABLE "VersionDeDocumento" ADD COLUMN IF NOT EXISTS "exploracionId" TEXT;
ALTER TABLE "VersionDeDocumento" ADD COLUMN IF NOT EXISTS "contenido"     JSONB;
ALTER TABLE "VersionDeDocumento" ADD COLUMN IF NOT EXISTS "tipo"          TEXT;
ALTER TABLE "VersionDeDocumento" ADD COLUMN IF NOT EXISTS "publicada"     BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE "VersionDeDocumento" ADD CONSTRAINT "VersionDeDocumento_exploracionId_fkey"
    FOREIGN KEY ("exploracionId") REFERENCES "ExploracionDeVenta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Un solo dueño por fila. Las filas de hoy tienen todas `canvasId`: el CHECK nace válido.
DO $$ BEGIN
  ALTER TABLE "VersionDeDocumento" ADD CONSTRAINT "VersionDeDocumento_un_solo_dueno"
    CHECK (num_nonnulls("canvasId", "exploracionId") = 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "VersionDeDocumento_exploracionId_createdAt_idx"
  ON "VersionDeDocumento" ("exploracionId", "createdAt");

-- La tabla ya tiene RLS desde su SQL (2026-09-28). Se repite: es idempotente y una foto trae el documento entero.
ALTER TABLE "VersionDeDocumento" ENABLE ROW LEVEL SECURITY;
