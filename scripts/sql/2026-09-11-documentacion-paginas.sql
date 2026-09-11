-- 2026-09-11 · Documentación pasa a ser una base de conocimiento: las páginas y su historial.
--
-- Por qué: hasta hoy `/documentacion` era un manual escrito en el código (`lib/manual/`), que
-- nadie del equipo podía cambiar sin un desarrollador. Pasa a ser una base de páginas y
-- subpáginas que el equipo lee y edita, al estilo de Notion. El contenido de cada página es el
-- JSON de bloques del editor (BlockNote).
--
-- ⛔ ESTO NO ES LA BIBLIOTECA DE LOS AGENTES. Esa es `KnowledgeDocument` (`/knowledge`), y la
-- lee el prompt de varios agentes por tags. Estas tablas son para personas: ningún agente las
-- lee, y lo vigila `lib/documentacion/guardas.test.ts`. Unificar las dos es otra tanda.
--
-- ADITIVO: 2 tablas nuevas. Nada se dropea, nada se renombra, ninguna tabla existente cambia.
-- El código viejo no las toca.
--
-- ⚠ `version` es el CONTROL DE CONCURRENCIA del contenido: el guardado manda la versión que
-- leyó y la escritura es `WHERE id = … AND version = …`. Si otra persona guardó antes, no
-- escribe y el editor avisa — nadie pisa a nadie en silencio. Mover o renombrar NO la sube.
--
-- ⚠ `semillaVersion` es la `version` que quedó al sembrar. Si hoy es distinta, una persona
-- editó la página y la siembra NO la pisa. Se compara por número y no por el contenido: el
-- editor normaliza los bloques al cargarlos, así que el JSON cambia sin que nadie edite.
--
-- ⚠ `archivadaLote`: archivar se lleva la rama entera con el mismo lote, y restaurar devuelve
-- exactamente ese grupo. No hay borrado definitivo desde la app.
--
-- Correr:  ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-11-documentacion-paginas.sql
-- Después: npx prisma generate  +  reiniciar el dev server (si no, las escrituras fallan
--          en silencio con el cliente viejo en memoria).
-- ⛔ NUNCA `prisma db push`: droppearía columnas (regla dual-PC, schema.prisma).

CREATE TABLE IF NOT EXISTS "PaginaDoc" (
  "id"              TEXT NOT NULL,
  "parentId"        TEXT,
  "slug"            TEXT NOT NULL,
  "titulo"          TEXT NOT NULL,
  "icono"           TEXT,
  "orden"           INTEGER NOT NULL DEFAULT 0,
  "contenido"       JSONB NOT NULL DEFAULT '[]',
  "texto"           TEXT NOT NULL DEFAULT '',
  "busqueda"        TEXT NOT NULL DEFAULT '',
  "version"         INTEGER NOT NULL DEFAULT 1,
  "bloqueada"       BOOLEAN NOT NULL DEFAULT false,
  "fija"            BOOLEAN NOT NULL DEFAULT false,
  "semillaVersion"  INTEGER,
  "archivadaAt"     TIMESTAMP(3),
  "archivadaLote"   TEXT,
  "creadaPorEmail"  TEXT,
  "editadaPorEmail" TEXT,
  "editadaAt"       TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaginaDoc_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PaginaDocVersion" (
  "id"         TEXT NOT NULL,
  "paginaId"   TEXT NOT NULL,
  "version"    INTEGER NOT NULL,
  "titulo"     TEXT NOT NULL,
  "icono"      TEXT,
  "contenido"  JSONB NOT NULL,
  "motivo"     TEXT NOT NULL,
  "autorEmail" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaginaDocVersion_pkey" PRIMARY KEY ("id")
);

-- El slug es la dirección de la página: único y estable (renombrar no lo cambia).
CREATE UNIQUE INDEX IF NOT EXISTS "PaginaDoc_slug_key" ON "PaginaDoc" ("slug");

-- El camino caliente: «las hijas de ESTA página, en su orden».
CREATE INDEX IF NOT EXISTS "PaginaDoc_parentId_orden_idx" ON "PaginaDoc" ("parentId", "orden");

-- El árbol vivo y la papelera se separan por esta columna.
CREATE INDEX IF NOT EXISTS "PaginaDoc_archivadaAt_idx" ON "PaginaDoc" ("archivadaAt");

-- El historial se lee de la versión más nueva a la más vieja.
CREATE INDEX IF NOT EXISTS "PaginaDocVersion_paginaId_createdAt_idx"
  ON "PaginaDocVersion" ("paginaId", "createdAt");

-- RESTRICT a propósito: no hay borrado definitivo, y una página con hijas no puede
-- desaparecer dejándolas colgadas.
DO $$ BEGIN
  ALTER TABLE "PaginaDoc" ADD CONSTRAINT "PaginaDoc_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "PaginaDoc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PaginaDocVersion" ADD CONSTRAINT "PaginaDocVersion_paginaId_fkey"
    FOREIGN KEY ("paginaId") REFERENCES "PaginaDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`: sin estas
-- líneas, las páginas serían leíbles con la publishable key que viaja en el bundle del
-- navegador. Sin policy SELECT = lock-down total (solo `postgres`/`service_role`).
ALTER TABLE "PaginaDoc" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaginaDocVersion" ENABLE ROW LEVEL SECURITY;
