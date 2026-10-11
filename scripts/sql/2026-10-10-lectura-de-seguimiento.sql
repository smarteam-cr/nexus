-- 2026-10-10 · Memoria de la cuenta, etapa 2: la lectura de seguimiento de cada reunión comparte la fila con Tareas.
--
-- Por qué: la lectura de cada reunión con un cliente o un prospecto (el post-proceso) pasa a ser durable. Su cola es
-- la MISMA fila `LecturaDeReunion` que usa Tareas (`sessionId` es único: tiene que ser la misma fila), con su propio
-- estado en estas 5 columnas. `estado` es la salida de Tareas y sus pantallas y reintentos ya lo usan: reusarlo para el
-- seguimiento rompería Tareas. Ver docs/DECISIONS.md «La lectura de cada reunión es durable…».
--
--   · "seguimientoEstado"   en_espera | leyendo | lista | sin_texto | copia | error | omitida (null = no la leyó)
--   · "seguimientoDesde"    en_espera: desde cuándo se puede tomar (un reintento espera ahí); leyendo: desde cuándo
--   · "seguimientoIntentos" cuántas veces se intentó (a la 3.ª que falla, queda en error)
--   · "seguimientoLeidaAt"  cuándo terminó
--   · "seguimientoError"    el último error
--
-- ADITIVO: 5 columnas nullable o con default, un CHECK y un índice. Nada se dropea, nada se renombra. La tabla ya tiene
-- RLS y la política RESTRICTIVE (2026-10-09-tareas.sql): no hace falta repetirlas.
--
-- ⚠ ORDEN: DESPUÉS de 2026-10-09-tareas.sql y ANTES del deploy que trae el código. Sin estas columnas, /api/health
-- responde 503 (lib/db/salud-del-esquema.ts) y el deploy se revierte solo.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-10-lectura-de-seguimiento.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server  +  npm run check:esquema en verde.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA prisma db push: droppearía columnas (regla dual-PC, schema.prisma).

ALTER TABLE "LecturaDeReunion"
  ADD COLUMN IF NOT EXISTS "seguimientoEstado" TEXT,
  ADD COLUMN IF NOT EXISTS "seguimientoDesde" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "seguimientoIntentos" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "seguimientoLeidaAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "seguimientoError" TEXT;

DO $$ BEGIN
  ALTER TABLE "LecturaDeReunion" ADD CONSTRAINT "LecturaDeReunion_seguimientoEstado_valido"
    CHECK ("seguimientoEstado" IS NULL OR "seguimientoEstado" IN ('en_espera', 'leyendo', 'lista', 'sin_texto', 'copia', 'error', 'omitida'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "LecturaDeReunion_seguimientoEstado_seguimientoDesde_idx"
  ON "LecturaDeReunion" ("seguimientoEstado", "seguimientoDesde");

-- Verificación (db execute no muestra filas; correr aparte si se quiere ver): tienen que salir las 5 columnas.
-- SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'LecturaDeReunion' AND column_name LIKE 'seguimiento%' ORDER BY 1;
