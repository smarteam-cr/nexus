-- 2026-10-16 · Uso de Nexus: cuántas veces abre cada persona cada sección, por día (etapa 4a de docs/mi-dia-plan.md).
--
-- Por qué: hasta hoy no se puede saber si «Para ti» sirve. Nexus solo sabe lo que cada persona escribió (una
-- respuesta, un guardado); lo que se lee sin escribir no deja rastro, y la sesión de Supabase se renueva sola, así que
-- tampoco sirve para contar. Decisión de Elías (2026-10-15): «que se guarde lo mínimo que sirva para verificar el uso
-- básico». Una fila por persona, sección y día: cuántas veces la abrió, la primera y la última hora. No guarda qué
-- cliente ni qué documento miró, ni minutos. El detalle por persona lo ve solo dirección.
--
-- ⚠ «sección» es la clave del ítem del menú (APP_NAV) y va como TEXT, no como enum: sumar un módulo no pide un
-- ALTER TYPE. La fija lib/uso/secciones.ts y la valida la API.
--
-- ADITIVO: 1 tabla nueva. Nada se dropea, nada se renombra, ninguna tabla existente cambia.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce el modelo)
-- y el deploy se revierte solo.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-16-uso-de-nexus.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`.

CREATE TABLE IF NOT EXISTS "UsoDeNexus" (
  "id"           TEXT NOT NULL,
  "personaEmail" TEXT NOT NULL,
  "seccion"      TEXT NOT NULL,
  "dia"          TEXT NOT NULL,
  "aperturas"    INTEGER NOT NULL DEFAULT 1,
  "primeraAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ultimaAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsoDeNexus_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UsoDeNexus_dia_formato" CHECK ("dia" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  CONSTRAINT "UsoDeNexus_aperturas_positivas" CHECK ("aperturas" >= 1),
  CONSTRAINT "UsoDeNexus_seccion_corta" CHECK (length("seccion") BETWEEN 1 AND 40)
);

-- Una fila por persona, sección y día: la apertura siguiente suma en la misma.
CREATE UNIQUE INDEX IF NOT EXISTS "UsoDeNexus_personaEmail_seccion_dia_key"
  ON "UsoDeNexus" ("personaEmail", "seccion", "dia");

-- La pantalla lee por período.
CREATE INDEX IF NOT EXISTS "UsoDeNexus_dia_idx"
  ON "UsoDeNexus" ("dia");

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`: sin esto, quién usa qué y cuándo
-- sería leíble con la clave pública que viaja en el navegador. RLS sin policy SELECT = cerrado; la RESTRICTIVE lo
-- mantiene cerrado aunque alguien sume mañana una policy permisiva. `postgres` (Prisma) tiene BYPASSRLS.
ALTER TABLE "UsoDeNexus" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "UsoDeNexus";
CREATE POLICY deny_all_non_superuser ON "UsoDeNexus" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado recién aplicado: rowsecurity = true.
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'UsoDeNexus';
