-- 2026-08-19 · El asistente que conversa: el hilo y sus turnos.
--
-- Por qué: hoy el CSE le pide un cambio a la IA y se genera. Si no era lo que quería, se
-- entera después de aplicar. El asistente conversa ANTES: pregunta qué se puede, dice qué
-- cuesta cada cosa, y recién con el acuerdo emite la instrucción que va al modificador de
-- siempre. Para eso la conversación tiene que sobrevivir a cambiar de pestaña, y hoy todo
-- el estado del canvas vive en memoria del navegador (ProjectCanvasPanel se remonta con
-- `key={activeProjectId}`), así que un hilo sin persistencia se pierde solo.
--
-- ⛔ EL CHAT NO ESCRIBE EL DOCUMENTO. Estas dos tablas guardan la CONVERSACIÓN, nada más.
-- Aplicar un cambio sigue pasando por el editor de siempre, con su vista previa y su
-- aceptación por ítem. El permiso vive en el botón, no en la conversación.
--
-- ADITIVO: 2 tablas nuevas + 1 enum + 1 relación inversa en Project. Nada se dropea, nada
-- se renombra, ninguna columna existente cambia. El código viejo no las toca.
--
-- ⚠ EL CONTEXTO NO SE GUARDA, y es una decisión: se re-arma en cada turno. Guardarlo son
-- cientos de KB por día que nadie lee, y miente en cuanto el CSE confirma un bloque del
-- handoff o toca una fase del cronograma. Lo que sí se guarda es la HUELLA del prefijo
-- (`shaDeContexto`): si cambió entre dos turnos, eso explica una respuesta que de otro modo
-- se lee como incoherente.
--
-- ⚠ `usuarioEmail` es NOT NULL a propósito: el chat NO tiene variante de sistema. Nullable
-- inventaría un estado que no existe y obligaría a todos los lectores a manejar un caso
-- imposible. (Contrasta con `BitacoraCobro.usuarioEmail`, que sí es nullable porque ahí las
-- entradas automáticas existen de verdad.)
--
-- ⚠ `modelo` es FIJO POR HILO. Es parte de la clave de la caché de prompt de Anthropic:
-- cambiarlo a mitad de una conversación invalida la caché entera y se paga el prefijo de
-- nuevo — sin error y sin log. Cambiar de modelo = hilo nuevo.
--
-- Correr:  ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-08-19-hilos-de-chat.sql
-- Después: npx prisma generate  +  reiniciar el dev server (si no, las escrituras fallan
--          en silencio con el cliente viejo en memoria).
-- ⛔ NUNCA `prisma db push`: droppearía columnas (regla dual-PC, schema.prisma).

DO $$ BEGIN
  CREATE TYPE "RolDeMensaje" AS ENUM ('CSE', 'ASISTENTE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "HiloDeChat" (
  "id"           TEXT NOT NULL,
  "projectId"    TEXT NOT NULL,
  "pieza"        TEXT NOT NULL,
  "usuarioEmail" TEXT NOT NULL,
  "modelo"       TEXT NOT NULL,
  "ultimoRunId"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HiloDeChat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MensajeDeChat" (
  "id"            TEXT NOT NULL,
  "hiloId"        TEXT NOT NULL,
  "rol"           "RolDeMensaje" NOT NULL,
  "contenido"     TEXT NOT NULL,
  "shaDeContexto" TEXT,
  "llmCallId"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MensajeDeChat_pkey" PRIMARY KEY ("id")
);

-- El camino caliente: «el hilo abierto de ESTE documento para ESTA persona».
CREATE INDEX IF NOT EXISTS "HiloDeChat_projectId_pieza_usuarioEmail_idx"
  ON "HiloDeChat" ("projectId", "pieza", "usuarioEmail");

-- Los turnos se leen SIEMPRE completos y en orden, del más viejo al más nuevo.
CREATE INDEX IF NOT EXISTS "MensajeDeChat_hiloId_createdAt_idx"
  ON "MensajeDeChat" ("hiloId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "HiloDeChat" ADD CONSTRAINT "HiloDeChat_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MensajeDeChat" ADD CONSTRAINT "MensajeDeChat_hiloId_fkey"
    FOREIGN KEY ("hiloId") REFERENCES "HiloDeChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
