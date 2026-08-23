-- 2026-08-23 (segunda del día) · Los ARCHIVOS de las licitaciones: el cartel, que hasta hoy
-- nadie leyó.
--
-- Por qué: el cartel de SICOP no llega como texto. Medido el 2026-08-23 sobre el pipeline
-- «Gobiernos»: de 58 notas, **33 llevan un archivo adjunto** y **30 no tienen una sola letra**
-- de texto — el equipo sube el PDF y listo. La IA lee el título y las notas, y del cartel no ve
-- nada. Esta tabla es donde aterriza el texto que se le saque a cada archivo.
--
-- ⛔ NO SE GUARDA EL BINARIO. Decisión de Elías: el archivo ya vive en HubSpot y ese es su
-- lugar. Nexus se lo baja en memoria, le extrae el texto con `lib/documents/extract-text.ts`
-- (el mismo extractor de los documentos de proyecto y de Drive) y lo tira. Una copia menos que
-- respaldar, una superficie menos con información de licitaciones, y ningún archivo espejado
-- que pueda quedar viejo respecto del original.
--
-- ⚠ HOY NO HAY PERMISO PARA BAJARLOS. Verificado el 2026-08-23: `GET /files/v3/files/{id}`
-- devuelve 403 MISSING_SCOPES pidiendo `files` · `files.read` · `files.ui_hidden.read`, y
-- ninguno está entre los 32 scopes de la app. Por eso existe el estado SIN_PERMISO: las filas
-- se crean igual —con lo que sí se sabe desde el ticket: qué nota, qué archivo— así que la
-- pantalla puede CONTAR los archivos y decir qué falta, en vez de fingir que no hay nada.
-- El día que se autorice, la misma corrida las completa sin tocar código.
--
-- ADITIVO: 1 tabla nueva + 1 enum + 2 columnas en `SicopLectura`. Nada se dropea ni se renombra.
--
-- Aplicación:
--   1. git pull  (esta base la comparten 2 PCs)
--   2. npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
--      → verificado: emite EXACTAMENTE esta tabla, este enum y estas 2 columnas, más el ruido
--        preexistente (embedding/pgvector y 4 DropIndex de Project/ProjectCanvas), que NO se aplica.
--   3. ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-08-23-sicop-adjuntos.sql
--   4. npx prisma generate     (NUNCA db push)
--   5. ALLOW_PROD_WRITE=1 npm run db:policies
--   6. reiniciar el dev server (el Prisma client viejo no entra por HMR)

-- ── Enum ────────────────────────────────────────────────────────────────────────
-- Los seis valores desde el día 1: un ALTER TYPE ADD VALUE no corre en transacción y obliga a
-- coordinar las 2 PCs.
--
-- ⚠ SIN_TEXTO y ERROR dicen cosas distintas y no se pueden juntar. SIN_TEXTO es el caso NORMAL
-- de los carteles del Estado: un PDF escaneado del que no hay nada que extraer sin OCR. ERROR
-- es que algo se rompió. Confundirlos haría que "la mitad del pipeline necesita OCR" se leyera
-- como "la integración está fallando".
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SicopAdjuntoEstado') THEN
        CREATE TYPE "SicopAdjuntoEstado" AS ENUM (
            'PENDIENTE',        -- se conoce el archivo, todavía no se bajó
            'EXTRAIDO',         -- se bajó y dio texto
            'SIN_TEXTO',        -- se bajó y NO dio texto (PDF escaneado → haría falta OCR)
            'SIN_PERMISO',      -- 403: falta el scope `files` en la app de HubSpot
            'DEMASIADO_GRANDE', -- por encima del tope; no se baja
            'ERROR'             -- cualquier otra falla, con el motivo en `error`
        );
    END IF;
END $$;

-- ── SicopAdjunto ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "SicopAdjunto" (
    "id"              TEXT                 NOT NULL,
    -- La identidad de dónde vive el archivo. Se guarda el TICKET además de la nota porque la
    -- pantalla pregunta siempre por ticket, y llegar por la nota obligaría a un join contra
    -- algo que no existe: las notas no se persisten (HubSpot es su dueño).
    "hubspotTicketId" TEXT                 NOT NULL,
    "hubspotNoteId"   TEXT                 NOT NULL,
    "hubspotFileId"   TEXT                 NOT NULL,

    -- Metadatos del archivo. NULL mientras no haya permiso para leerlos.
    "nombre"          TEXT,
    "extension"       TEXT,
    "mimeType"        TEXT,
    "tamanoBytes"     INTEGER,
    -- ⚠ La URL NO se arma a mano. Es la que devuelve la propia API de HubSpot; sin permiso
    -- queda NULL y la pantalla enlaza al ticket, que siempre existe. Inventar el formato de
    -- una URL de File Manager da un 404 adentro de HubSpot que se lee como falta de permisos.
    "urlHubspot"      TEXT,

    "estado"          "SicopAdjuntoEstado" NOT NULL DEFAULT 'PENDIENTE',
    -- Lo ÚNICO que se guarda del archivo. El extractor corta en 50.000 caracteres.
    "texto"           TEXT,
    "caracteres"      INTEGER              NOT NULL DEFAULT 0,
    "error"           TEXT,
    "intentadoEl"     TIMESTAMP(3),
    "extraidoEl"      TIMESTAMP(3),

    "createdAt"       TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)         NOT NULL,
    CONSTRAINT "SicopAdjunto_pkey" PRIMARY KEY ("id")
);

-- Un archivo aparece UNA vez por licitación. Se elige (ticket, archivo) y no el archivo solo
-- porque el mismo PDF puede colgar de dos licitaciones —pasa con los carteles marco— y con la
-- clave puesta en el archivo, la segunda licitación no lo vería.
-- ⚠ El nombre lo dicta Prisma (`Modelo_col1_col2_key`). Ponerle uno propio deja una línea
-- de drift permanente en el detector, que es ruido para siempre a cambio de nada.
CREATE UNIQUE INDEX IF NOT EXISTS "SicopAdjunto_hubspotTicketId_hubspotFileId_key"
    ON "SicopAdjunto" ("hubspotTicketId", "hubspotFileId");
-- El camino caliente: "los archivos de estas 45 licitaciones".
CREATE INDEX IF NOT EXISTS "SicopAdjunto_hubspotTicketId_idx" ON "SicopAdjunto" ("hubspotTicketId");
-- Para la corrida: "traeme lo que quedó pendiente".
CREATE INDEX IF NOT EXISTS "SicopAdjunto_estado_idx" ON "SicopAdjunto" ("estado");

-- Un tamaño negativo sería un error de lectura del metadato, no un archivo.
ALTER TABLE "SicopAdjunto" DROP CONSTRAINT IF EXISTS "SicopAdjunto_tamano_no_negativo";
ALTER TABLE "SicopAdjunto" ADD CONSTRAINT "SicopAdjunto_tamano_no_negativo"
    CHECK ("tamanoBytes" IS NULL OR "tamanoBytes" >= 0);

ALTER TABLE "SicopAdjunto" ENABLE ROW LEVEL SECURITY;

-- ⚠ Prisma NO modela un default en `updatedAt` (lo escribe el cliente): dejarlo con
-- DEFAULT CURRENT_TIMESTAMP le mete una línea de drift permanente al detector.
ALTER TABLE "SicopAdjunto" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- ── SicopLectura: ¿la conclusión salió del cartel o del título? ──────────────────
-- Sin esto, una ficha leída a fondo y una leída del título pelado se ven idénticas en pantalla,
-- y son cosas muy distintas para decidir si presentarse a una licitación.
ALTER TABLE "SicopLectura" ADD COLUMN IF NOT EXISTS "profundo"       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SicopLectura" ADD COLUMN IF NOT EXISTS "adjuntosLeidos" INTEGER NOT NULL DEFAULT 0;
