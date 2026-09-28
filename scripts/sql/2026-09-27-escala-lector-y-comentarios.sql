-- 2026-09-27 · La Escala de Rendimiento en Nexus: la versión publicada y los comentarios del equipo.
--
-- Por qué: la escala 7.0.0 está congelada hasta usarla con cinco a diez clientes, y cada cambio
-- tiene que salir de un caso real («Cambios pendientes» del manual de operación). Elías pidió una
-- sección para recorrerla por área, dimensión y nivel, y comentar donde algo no se entiende o no
-- calza con un cliente. Tres tablas:
--
--   · "EscalaDocumento" — cada versión PUBLICADA de los tres documentos (escala, especificación,
--     manual), con su texto exacto. Nexus es la fuente: la sección lee de acá y el botón de
--     descarga devuelve estos bytes. ⚠ La imagen de producción no lleva ningún .md, así que la
--     app no puede leer `docs/escala/`: una versión entra con `scripts/publicar-escala.ts`, que la
--     valida antes. Solo se INSERTA: una versión publicada no se pisa.
--   · "EscalaComentario" — un comentario anclado a un identificador estable (la dimensión `1.7`,
--     el nivel `1.7.F` o el criterio `1.7.F1`), con la versión y el texto de ese momento.
--   · "EscalaRespuesta" — las respuestas de un comentario.
--
-- ⚠ Tipos y estados van como TEXT y no como enum (misma decisión que INV4 en el resto del
-- schema): sumar un tipo no debe exigir un ALTER TYPE. Los valores los fija
-- `lib/escala/comentarios/reglas.ts` y los valida la API.
--
-- ADITIVO: 3 tablas nuevas. Nada se dropea, nada se renombra, ninguna tabla existente cambia
-- (la FK a "Client" es nueva y va con ON DELETE SET NULL: borrar un cliente no borra el caso).
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, la sección de la escala muestra «todavía no está
-- publicada» y los comentarios no abren; no rompe nada más.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-09-27-escala-lector-y-comentarios.sql
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`: droppearía columnas (regla dual-PC, schema.prisma).

CREATE TABLE IF NOT EXISTS "EscalaDocumento" (
  "id"                TEXT NOT NULL,
  "documento"         TEXT NOT NULL,
  "version"           TEXT NOT NULL,
  "escalaVersion"     TEXT NOT NULL,
  "archivo"           TEXT NOT NULL,
  "texto"             TEXT NOT NULL,
  "huella"            TEXT NOT NULL,
  "publicadaEn"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publicadaPorEmail" TEXT,
  CONSTRAINT "EscalaDocumento_pkey" PRIMARY KEY ("id")
);

-- Una versión de un documento se publica UNA vez.
CREATE UNIQUE INDEX IF NOT EXISTS "EscalaDocumento_documento_version_key"
  ON "EscalaDocumento" ("documento", "version");

-- El camino caliente: «la última publicada de la escala».
CREATE INDEX IF NOT EXISTS "EscalaDocumento_documento_publicadaEn_idx"
  ON "EscalaDocumento" ("documento", "publicadaEn");

CREATE TABLE IF NOT EXISTS "EscalaComentario" (
  "id"                     TEXT NOT NULL,
  "ancla"                  TEXT NOT NULL,
  "tipoDeAncla"            TEXT NOT NULL,
  "area"                   TEXT NOT NULL,
  "dimension"              TEXT NOT NULL,
  "versionEscala"          TEXT NOT NULL,
  "textoAnclado"           TEXT NOT NULL,
  "tipo"                   TEXT NOT NULL,
  "cuerpo"                 TEXT NOT NULL,
  "decisionQueCambiaria"   TEXT,
  "clienteId"              TEXT,
  "clienteNombre"          TEXT,
  "perfilCierre"           TEXT,
  "perfilDespues"          TEXT,
  "autorEmail"             TEXT NOT NULL,
  "estado"                 TEXT NOT NULL DEFAULT 'abierto',
  "estadoCambiadoAt"       TIMESTAMP(3),
  "estadoCambiadoPorEmail" TEXT,
  "cambioQue"              TEXT,
  "cambioCaso"             TEXT,
  "cambioDecision"         TEXT,
  "motivoDescarte"         TEXT,
  "editadoAt"              TIMESTAMP(3),
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EscalaComentario_pkey" PRIMARY KEY ("id")
);

-- Los contadores de la pantalla: por área y estado.
CREATE INDEX IF NOT EXISTS "EscalaComentario_area_estado_idx"
  ON "EscalaComentario" ("area", "estado");

-- «Los comentarios de ESTE criterio».
CREATE INDEX IF NOT EXISTS "EscalaComentario_ancla_idx"
  ON "EscalaComentario" ("ancla");

-- La bandeja, por estado y en orden.
CREATE INDEX IF NOT EXISTS "EscalaComentario_estado_createdAt_idx"
  ON "EscalaComentario" ("estado", "createdAt");

CREATE TABLE IF NOT EXISTS "EscalaRespuesta" (
  "id"           TEXT NOT NULL,
  "comentarioId" TEXT NOT NULL,
  "autorEmail"   TEXT NOT NULL,
  "cuerpo"       TEXT NOT NULL,
  "editadoAt"    TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EscalaRespuesta_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EscalaRespuesta_comentarioId_createdAt_idx"
  ON "EscalaRespuesta" ("comentarioId", "createdAt");

-- SET NULL: si un cliente se borra, el caso queda (con su nombre congelado en "clienteNombre").
DO $$ BEGIN
  ALTER TABLE "EscalaComentario" ADD CONSTRAINT "EscalaComentario_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "EscalaRespuesta" ADD CONSTRAINT "EscalaRespuesta_comentarioId_fkey"
    FOREIGN KEY ("comentarioId") REFERENCES "EscalaComentario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`: sin esto, los
-- comentarios serían leíbles con la clave pública que viaja en el navegador. RLS sin policy
-- SELECT = cerrado para `anon` y `authenticated`; la RESTRICTIVE de encima lo mantiene cerrado
-- aunque alguien sume mañana una policy permisiva. `postgres` (Prisma) tiene BYPASSRLS.
-- Se verifica POR EFECTO con `scripts/verificar-escala-anon.ts`.
ALTER TABLE "EscalaDocumento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EscalaComentario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EscalaRespuesta" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "EscalaDocumento";
CREATE POLICY deny_all_non_superuser ON "EscalaDocumento" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "EscalaComentario";
CREATE POLICY deny_all_non_superuser ON "EscalaComentario" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "EscalaRespuesta";
CREATE POLICY deny_all_non_superuser ON "EscalaRespuesta" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado recién aplicado: 0 | 0 | 0 y las tres con rowsecurity = true.
--   SELECT (SELECT COUNT(*) FROM "EscalaDocumento") AS docs,
--          (SELECT COUNT(*) FROM "EscalaComentario") AS comentarios,
--          (SELECT COUNT(*) FROM "EscalaRespuesta") AS respuestas;
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'Escala%';
