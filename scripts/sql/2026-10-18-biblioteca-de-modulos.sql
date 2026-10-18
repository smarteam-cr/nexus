-- 2026-10-18 · La biblioteca de módulos de las propuestas (ModuloDePropuesta).
--
-- Una fila por MÓDULO: una sección personalizada de una propuesta que alguien de Ventas guardó para usarla en otra
-- («Guardar como módulo» → «Agregar módulo» inserta una copia). Guarda el tipo de la sección, su data, la empresa para
-- la que se armó y lo que se encontró de esa empresa al guardarlo. Lo escriben solo las rutas de
-- app/api/business-cases/modulos. Interno: el cliente no lo ve.
--
-- ADITIVO: 1 tabla nueva con RLS y una política RESTRICTIVE que niega todo a anon/authenticated (solo la lee Prisma).
--
-- ⛔ ORDEN: esto va ANTES del deploy. /api/health responde 503 sin esta tabla y deploy.sh revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-18-biblioteca-de-modulos.sql; Remove-Item Env:ALLOW_PROD_WRITE
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`. Se puede correr dos veces.

CREATE TABLE IF NOT EXISTS "ModuloDePropuesta" (
  "id"                   TEXT PRIMARY KEY,
  "nombre"               TEXT NOT NULL,
  "descripcion"          TEXT,
  "tipo"                 TEXT NOT NULL,
  "data"                 JSONB NOT NULL,
  "origenBusinessCaseId" TEXT REFERENCES "BusinessCase"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "origenClienteNombre"  TEXT,
  "avisos"               JSONB NOT NULL DEFAULT '[]'::jsonb,
  "usos"                 INTEGER NOT NULL DEFAULT 0,
  "creadoPorEmail"       TEXT NOT NULL,
  "archivadoAt"          TIMESTAMP(3),
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "ModuloDePropuesta_archivadoAt_updatedAt_idx" ON "ModuloDePropuesta"("archivadoAt", "updatedAt");
CREATE INDEX IF NOT EXISTS "ModuloDePropuesta_origenBusinessCaseId_idx" ON "ModuloDePropuesta"("origenBusinessCaseId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ModuloDePropuesta_usos_check') THEN
    ALTER TABLE "ModuloDePropuesta" ADD CONSTRAINT "ModuloDePropuesta_usos_check" CHECK ("usos" >= 0);
  END IF;
END $$;

ALTER TABLE "ModuloDePropuesta" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ModuloDePropuesta' AND policyname = 'deny_all_non_superuser') THEN
    CREATE POLICY "deny_all_non_superuser" ON "ModuloDePropuesta" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
END $$;
