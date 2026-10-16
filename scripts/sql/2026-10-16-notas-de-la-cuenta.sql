-- 2026-10-16 · Notas de la cuenta (etapa 5 de docs/mi-dia-plan.md).
--
-- Por qué: lo que pasa por WhatsApp, una llamada o un correo con un cliente no queda en ningún lado de Nexus, y las
-- reuniones de Meet no quedan en el registro de HubSpot. Una nota de la cuenta guarda eso (texto, canal, fecha, autor y,
-- si aplica, el negocio o el proyecto), se escribe en HubSpot como nota de la empresa y entra a la memoria interna de la
-- cuenta. La misma tabla guarda la nota que Nexus sugiere después de una reunión, cuando alguien la usa o la descarta.
--
-- ADITIVO: 1 tabla nueva. Nada se dropea, nada se renombra, ninguna tabla existente cambia.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy. Sin él, `/api/health` responde 503 (el cliente Prisma ya conoce el modelo) y
-- el deploy se revierte solo.
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-16-notas-de-la-cuenta.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⚠ SIN --schema: con Prisma 7 esa opción ya no existe.
-- ⛔ NUNCA `prisma db push`.

CREATE TABLE IF NOT EXISTS "NotaDeLaCuenta" (
  "id"               TEXT NOT NULL,
  "clientId"         TEXT NOT NULL,
  "projectId"        TEXT,
  "hubspotDealId"    TEXT,
  "canal"            TEXT NOT NULL,
  "fecha"            DATE NOT NULL,
  "texto"            TEXT NOT NULL,
  "autorEmail"       TEXT NOT NULL,
  "origen"           TEXT NOT NULL DEFAULT 'persona',
  "sessionId"        TEXT,
  "estado"           TEXT NOT NULL DEFAULT 'vigente',
  "archivadaPor"     TEXT,
  "archivadaAt"      TIMESTAMP(3),
  "hubspotEstado"    TEXT NOT NULL DEFAULT 'pendiente',
  "hubspotNotaId"    TEXT,
  "hubspotError"     TEXT,
  "hubspotIntentos"  INTEGER NOT NULL DEFAULT 0,
  "hubspotEscritaAt" TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotaDeLaCuenta_pkey" PRIMARY KEY ("id")
);

-- Lo que no puede pasar, en la base (las reglas viven en lib/notas/reglas.ts).
DO $$ BEGIN
  ALTER TABLE "NotaDeLaCuenta" ADD CONSTRAINT "NotaDeLaCuenta_canal_check"
    CHECK ("canal" IN ('whatsapp', 'llamada', 'correo', 'en_persona', 'reunion', 'otro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "NotaDeLaCuenta" ADD CONSTRAINT "NotaDeLaCuenta_origen_check"
    CHECK ("origen" IN ('persona', 'reunion', 'chat'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "NotaDeLaCuenta" ADD CONSTRAINT "NotaDeLaCuenta_estado_check"
    CHECK ("estado" IN ('vigente', 'descartada', 'archivada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "NotaDeLaCuenta" ADD CONSTRAINT "NotaDeLaCuenta_hubspotEstado_check"
    CHECK ("hubspotEstado" IN ('pendiente', 'escrita', 'error', 'sin_hubspot', 'no_va'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- La sugerida después de una reunión siempre dice de qué reunión salió.
DO $$ BEGIN
  ALTER TABLE "NotaDeLaCuenta" ADD CONSTRAINT "NotaDeLaCuenta_reunion_check"
    CHECK ("origen" <> 'reunion' OR "sessionId" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "NotaDeLaCuenta_clientId_estado_fecha_idx"
  ON "NotaDeLaCuenta" ("clientId", "estado", "fecha");
CREATE INDEX IF NOT EXISTS "NotaDeLaCuenta_sessionId_idx"
  ON "NotaDeLaCuenta" ("sessionId");
CREATE INDEX IF NOT EXISTS "NotaDeLaCuenta_hubspotEstado_idx"
  ON "NotaDeLaCuenta" ("hubspotEstado");

-- Una sola decisión por reunión sobre su nota sugerida: dos clics a la vez no dejan dos notas en HubSpot.
CREATE UNIQUE INDEX IF NOT EXISTS "NotaDeLaCuenta_una_sugerencia_por_reunion"
  ON "NotaDeLaCuenta" ("sessionId") WHERE "origen" = 'reunion';

DO $$ BEGIN
  ALTER TABLE "NotaDeLaCuenta" ADD CONSTRAINT "NotaDeLaCuenta_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "NotaDeLaCuenta" ADD CONSTRAINT "NotaDeLaCuenta_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "NotaDeLaCuenta" ADD CONSTRAINT "NotaDeLaCuenta_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "FirefliesSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS ─────────────────────────────────────────────────────────────────────────────
-- ⚠ OBLIGATORIO — Supabase auto-otorga GRANT SELECT a `anon` sobre todo `public`: sin esto, lo que el equipo anota de
-- cada cliente sería leíble con la clave pública que viaja en el navegador. RLS sin policy SELECT = cerrado; la
-- RESTRICTIVE lo mantiene cerrado aunque alguien sume mañana una policy permisiva.
ALTER TABLE "NotaDeLaCuenta" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "NotaDeLaCuenta";
CREATE POLICY deny_all_non_superuser ON "NotaDeLaCuenta" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado recién aplicado: rowsecurity = true.
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'NotaDeLaCuenta';
