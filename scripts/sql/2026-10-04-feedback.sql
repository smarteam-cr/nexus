-- 2026-10-04 · Feedback: el equipo reporta problemas, mejoras y dudas desde cualquier pantalla de Nexus.
--
-- Por qué: Elías hace sesiones para que cada persona le diga qué mejorar de la interfaz, y la mitad no
-- se acuerda de lo que le molestó. El botón «Feedback» del pie del menú guarda el reporte EN EL MOMENTO,
-- con una captura de la pantalla, la dirección, el rol, el navegador y los errores de esa pantalla.
-- Elías lo revisa en /feedback (bandeja, hoja de ruta y personas). Cuatro tablas:
--
--   · "FeedbackReporte" — un reporte: tipo (falla · mejora · duda), el texto, si le frena el trabajo,
--     dónde estaba, la captura (path privado en Storage) y qué se decidió con él.
--   · "FeedbackMensaje" — la conversación entre quien reportó y quien revisa.
--   · "FeedbackTema"    — un tema de la hoja de ruta: junta los reportes que piden lo mismo. Un reporte
--     llega a un tema SOLO cuando una persona lo lleva desde la bandeja: nada entra solo.
--   · "FeedbackPedido"  — Elías le pide la opinión a alguien sobre una pantalla. Le aparece al entrar a
--     esa pantalla hasta que responda o diga «Ahora no».
--
-- ⚠ Tipos, estados y columnas van como TEXT y no como enum (misma decisión que INV4 en el resto del
-- schema): sumar un valor no debe exigir un ALTER TYPE. Los valores los fija `lib/feedback/reglas.ts`
-- y los valida la API.
--
-- ADITIVO: 4 tablas nuevas. Nada se dropea, nada se renombra, ninguna tabla existente cambia.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, el panel de Feedback dice que falta este archivo y no
-- guarda nada; no rompe nada más.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-04-feedback.sql
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`: droppearía columnas (regla dual-PC, schema.prisma).

CREATE TABLE IF NOT EXISTS "FeedbackTema" (
  "id"                TEXT NOT NULL,
  "titulo"            TEXT NOT NULL,
  "detalle"           TEXT,
  "pantalla"          TEXT,
  "columna"           TEXT NOT NULL DEFAULT 'decidir',
  "origen"            TEXT NOT NULL DEFAULT 'mano',
  "origenReporteId"   TEXT,
  "aNombreDe"         TEXT,
  "creadoPorEmail"    TEXT NOT NULL,
  "movidoAt"          TIMESTAMP(3),
  "listoAt"           TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedbackTema_pkey" PRIMARY KEY ("id")
);

-- La hoja de ruta, por columna y en orden.
CREATE INDEX IF NOT EXISTS "FeedbackTema_columna_createdAt_idx"
  ON "FeedbackTema" ("columna", "createdAt");

CREATE TABLE IF NOT EXISTS "FeedbackPedido" (
  "id"              TEXT NOT NULL,
  "paraEmail"       TEXT NOT NULL,
  "pantalla"        TEXT NOT NULL,
  "ruta"            TEXT NOT NULL,
  "pregunta"        TEXT NOT NULL,
  "hasta"           TIMESTAMP(3),
  "estado"          TEXT NOT NULL DEFAULT 'abierto',
  "vistoVeces"      INTEGER NOT NULL DEFAULT 0,
  "respondidoAt"    TIMESTAMP(3),
  "descartadoAt"    TIMESTAMP(3),
  "creadoPorEmail"  TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedbackPedido_pkey" PRIMARY KEY ("id")
);

-- «Lo que me pidieron y sigue abierto»: se lee al entrar a Nexus.
CREATE INDEX IF NOT EXISTS "FeedbackPedido_paraEmail_estado_idx"
  ON "FeedbackPedido" ("paraEmail", "estado");

CREATE TABLE IF NOT EXISTS "FeedbackReporte" (
  "id"               TEXT NOT NULL,
  "numero"           SERIAL NOT NULL,
  "autorEmail"       TEXT NOT NULL,
  "tipo"             TEXT NOT NULL,
  "cuerpo"           TEXT NOT NULL,
  "meFrena"          BOOLEAN NOT NULL DEFAULT false,
  "pantalla"         TEXT NOT NULL,
  "ruta"             TEXT NOT NULL,
  "rol"              TEXT,
  "navegador"        TEXT,
  "ventana"          TEXT,
  "version"          TEXT,
  "errores"          JSONB,
  "capturaPath"      TEXT,
  "marcas"           JSONB,
  "estado"           TEXT NOT NULL DEFAULT 'sin_revisar',
  "temaId"           TEXT,
  "pedidoId"         TEXT,
  "motivoCierre"     TEXT,
  "decididoPorEmail" TEXT,
  "decididoAt"       TIMESTAMP(3),
  "autorLeyoAt"      TIMESTAMP(3),
  "revisorLeyoAt"    TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedbackReporte_pkey" PRIMARY KEY ("id")
);

-- El número que la persona cita («F-128»): único.
CREATE UNIQUE INDEX IF NOT EXISTS "FeedbackReporte_numero_key"
  ON "FeedbackReporte" ("numero");

-- La bandeja, por estado y en orden.
CREATE INDEX IF NOT EXISTS "FeedbackReporte_estado_createdAt_idx"
  ON "FeedbackReporte" ("estado", "createdAt");

-- «Mis reportes» y la cuenta de cada persona.
CREATE INDEX IF NOT EXISTS "FeedbackReporte_autorEmail_createdAt_idx"
  ON "FeedbackReporte" ("autorEmail", "createdAt");

-- Los reportes de un tema.
CREATE INDEX IF NOT EXISTS "FeedbackReporte_temaId_idx"
  ON "FeedbackReporte" ("temaId");

CREATE TABLE IF NOT EXISTS "FeedbackMensaje" (
  "id"          TEXT NOT NULL,
  "reporteId"   TEXT NOT NULL,
  "autorEmail"  TEXT NOT NULL,
  "cuerpo"      TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedbackMensaje_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FeedbackMensaje_reporteId_createdAt_idx"
  ON "FeedbackMensaje" ("reporteId", "createdAt");

-- SET NULL: borrar un tema devuelve sus reportes a «sin tema»; nunca borra lo que reportó alguien.
DO $$ BEGIN
  ALTER TABLE "FeedbackReporte" ADD CONSTRAINT "FeedbackReporte_temaId_fkey"
    FOREIGN KEY ("temaId") REFERENCES "FeedbackTema"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FeedbackReporte" ADD CONSTRAINT "FeedbackReporte_pedidoId_fkey"
    FOREIGN KEY ("pedidoId") REFERENCES "FeedbackPedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "FeedbackMensaje" ADD CONSTRAINT "FeedbackMensaje_reporteId_fkey"
    FOREIGN KEY ("reporteId") REFERENCES "FeedbackReporte"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`: sin esto, los
-- reportes (con lo que la gente opina de su trabajo) serían leíbles con la clave pública que viaja en
-- el navegador. RLS sin policy SELECT = cerrado para `anon` y `authenticated`; la RESTRICTIVE de
-- encima lo mantiene cerrado aunque alguien sume mañana una policy permisiva. `postgres` (Prisma)
-- tiene BYPASSRLS.
ALTER TABLE "FeedbackReporte" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeedbackMensaje" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeedbackTema" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeedbackPedido" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "FeedbackReporte";
CREATE POLICY deny_all_non_superuser ON "FeedbackReporte" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "FeedbackMensaje";
CREATE POLICY deny_all_non_superuser ON "FeedbackMensaje" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "FeedbackTema";
CREATE POLICY deny_all_non_superuser ON "FeedbackTema" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "FeedbackPedido";
CREATE POLICY deny_all_non_superuser ON "FeedbackPedido" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado recién aplicado: las cuatro con rowsecurity = true.
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'Feedback%';
