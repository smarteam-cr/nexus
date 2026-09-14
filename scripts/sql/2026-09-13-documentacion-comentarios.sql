-- 2026-09-13 · Comentarios en las páginas de Documentación, como en Notion.
--
-- Por qué: Elías pidió que todo el equipo pueda comentar cualquier página (marcando un texto o un
-- bloque) y que solo Súper admin y CSL resuelvan. Sin correos: la base muestra cuántos hilos
-- abiertos hay.
--
-- ⚠ El comentario vive FUERA del contenido de la página. El editor (BlockNote) descarta su propia
-- marca de comentario al pasar la página a JSON, así que un comentario guardado adentro se
-- perdería al guardar. Acá se ancla con el id del bloque y el TEXTO citado (con unas letras antes
-- y después para desambiguar): si el bloque cambia de id, se busca la cita. Comentar no toca
-- `PaginaDoc.contenido`, no sube su versión ni entra al historial.
--
-- ADITIVO: 2 tablas nuevas. Nada se dropea, nada se renombra, ninguna tabla existente cambia.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. El árbol de Documentación cuenta los hilos abiertos:
-- con el código nuevo y sin estas tablas, Documentación no abre.
--
-- Correr:  ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-13-documentacion-comentarios.sql
-- Después: npx prisma generate  +  reiniciar el dev server (si no, las escrituras fallan
--          en silencio con el cliente viejo en memoria).
-- ⛔ NUNCA `prisma db push`: droppearía columnas (regla dual-PC, schema.prisma).

CREATE TABLE IF NOT EXISTS "HiloDeComentariosDoc" (
  "id"               TEXT NOT NULL,
  "paginaId"         TEXT NOT NULL,
  "bloqueId"         TEXT NOT NULL,
  "cita"             TEXT NOT NULL DEFAULT '',
  "antes"            TEXT NOT NULL DEFAULT '',
  "despues"          TEXT NOT NULL DEFAULT '',
  "autorEmail"       TEXT NOT NULL,
  "resueltoAt"       TIMESTAMP(3),
  "resueltoPorEmail" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HiloDeComentariosDoc_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ComentarioDoc" (
  "id"         TEXT NOT NULL,
  "hiloId"     TEXT NOT NULL,
  "autorEmail" TEXT NOT NULL,
  "cuerpo"     TEXT NOT NULL,
  "editadoAt"  TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComentarioDoc_pkey" PRIMARY KEY ("id")
);

-- El camino caliente: «los hilos de ESTA página» y «cuántos abiertos tiene».
CREATE INDEX IF NOT EXISTS "HiloDeComentariosDoc_paginaId_resueltoAt_idx"
  ON "HiloDeComentariosDoc" ("paginaId", "resueltoAt");

-- Un hilo se lee en el orden en que se escribió.
CREATE INDEX IF NOT EXISTS "ComentarioDoc_hiloId_createdAt_idx"
  ON "ComentarioDoc" ("hiloId", "createdAt");

-- CASCADE: una página no se borra desde la app (se archiva), pero si alguien la borra a mano,
-- sus hilos no quedan colgados. Borrar el último comentario de un hilo borra el hilo (en la app).
DO $$ BEGIN
  ALTER TABLE "HiloDeComentariosDoc" ADD CONSTRAINT "HiloDeComentariosDoc_paginaId_fkey"
    FOREIGN KEY ("paginaId") REFERENCES "PaginaDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ComentarioDoc" ADD CONSTRAINT "ComentarioDoc_hiloId_fkey"
    FOREIGN KEY ("hiloId") REFERENCES "HiloDeComentariosDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`: sin estas
-- líneas, los comentarios serían leíbles con la publishable key que viaja en el bundle del
-- navegador. Sin policy SELECT = lock-down total (solo `postgres`/`service_role`).
ALTER TABLE "HiloDeComentariosDoc" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComentarioDoc" ENABLE ROW LEVEL SECURITY;
