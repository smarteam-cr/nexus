-- 2026-10-17 · La foto del margen de cada mes (Rentabilidad, E6 de docs/rentabilidad-y-carga-plan.md).
--
-- FotoMargenMes: una fila por mes cerrado, con los totales (planilla, horas, costo de la hora), los supuestos de la carga
-- y el tipo de cambio con que se calculó. FotoMargenCuenta: una fila por cuenta y mes, con lo cobrado, las horas por
-- origen (calendario, respondido, estimado), el costo con cada modo y el margen. Todo en dólares. La escribe SOLO
-- lib/rentabilidad/foto-server.ts. `FotoMargenCuenta.clientId` va SIN FK a propósito: es la foto del pasado.
--
-- ADITIVO: 2 tablas nuevas con RLS y una política RESTRICTIVE que niega todo a anon/authenticated (solo la lee Prisma).
-- ⛔ Lleva planilla y el costo de la hora de cada persona: solo dirección.
--
-- ⛔ ORDEN: esto va ANTES del deploy. /api/health responde 503 sin estas tablas y deploy.sh revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-17-foto-del-margen.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`. Se puede correr dos veces.

CREATE TABLE IF NOT EXISTS "FotoMargenMes" (
  "id"               TEXT PRIMARY KEY,
  "mes"              TEXT NOT NULL,
  "version"          INTEGER NOT NULL DEFAULT 1,
  "tomadaPor"        TEXT NOT NULL,
  "tomadaAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "motivo"           TEXT,
  "planilla"         DECIMAL(12,2) NOT NULL,
  "ingreso"          DECIMAL(12,2) NOT NULL,
  "horasPagadas"     DECIMAL(10,2) NOT NULL,
  "horasConClientes" DECIMAL(10,2) NOT NULL,
  "horasCalendario"  DECIMAL(10,2) NOT NULL,
  "horasRespondidas" DECIMAL(10,2) NOT NULL,
  "horasEstimadas"   DECIMAL(10,2) NOT NULL,
  "horasPorSesion"   DECIMAL(10,4) NOT NULL,
  "costoHoraDirecto" DECIMAL(12,2),
  "costoHoraCargado" DECIMAL(12,2),
  "preparacionMin"   INTEGER NOT NULL,
  "supuestos"        JSONB NOT NULL,
  "tasa"             JSONB,
  "costos"           JSONB NOT NULL,
  "personas"         JSONB NOT NULL,
  "avisos"           JSONB NOT NULL,
  "updatedAt"        TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "FotoMargenMes_mes_key" ON "FotoMargenMes"("mes");

CREATE TABLE IF NOT EXISTS "FotoMargenCuenta" (
  "id"               TEXT PRIMARY KEY,
  "fotoId"           TEXT NOT NULL REFERENCES "FotoMargenMes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "mes"              TEXT NOT NULL,
  "clientId"         TEXT NOT NULL,
  "nombre"           TEXT NOT NULL,
  "cse"              TEXT,
  "ingreso"          DECIMAL(12,2) NOT NULL,
  "fuenteIngreso"    TEXT,
  "horasCalendario"  DECIMAL(10,2) NOT NULL,
  "horasPreparacion" DECIMAL(10,2) NOT NULL,
  "horasEntrega"     DECIMAL(10,2) NOT NULL,
  "horasRespondidas" DECIMAL(10,2) NOT NULL,
  "horasEstimadas"   DECIMAL(10,2) NOT NULL,
  "reuniones"        INTEGER NOT NULL,
  "planSesiones"     DECIMAL(10,2),
  "planHorasTareas"  DECIMAL(10,2),
  "costoPersona"     DECIMAL(12,2) NOT NULL,
  "costoEquipo"      DECIMAL(12,2) NOT NULL,
  "costoCargado"     DECIMAL(12,2) NOT NULL,
  "margenPersona"    DECIMAL(12,2) NOT NULL,
  "margenEquipo"     DECIMAL(12,2) NOT NULL,
  "margenCargado"    DECIMAL(12,2) NOT NULL,
  "factor"           DECIMAL(5,2) NOT NULL,
  "porPersona"       JSONB NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "FotoMargenCuenta_mes_clientId_key" ON "FotoMargenCuenta"("mes", "clientId");
CREATE INDEX IF NOT EXISTS "FotoMargenCuenta_clientId_mes_idx" ON "FotoMargenCuenta"("clientId", "mes");
CREATE INDEX IF NOT EXISTS "FotoMargenCuenta_fotoId_idx" ON "FotoMargenCuenta"("fotoId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FotoMargenMes_mes_check') THEN
    ALTER TABLE "FotoMargenMes" ADD CONSTRAINT "FotoMargenMes_mes_check" CHECK ("mes" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FotoMargenCuenta_fuenteIngreso_check') THEN
    ALTER TABLE "FotoMargenCuenta" ADD CONSTRAINT "FotoMargenCuenta_fuenteIngreso_check" CHECK ("fuenteIngreso" IS NULL OR "fuenteIngreso" IN ('Cobranza', 'Odoo'));
  END IF;
END $$;

ALTER TABLE "FotoMargenMes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FotoMargenCuenta" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'FotoMargenMes' AND policyname = 'deny_all_non_superuser') THEN
    CREATE POLICY "deny_all_non_superuser" ON "FotoMargenMes" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'FotoMargenCuenta' AND policyname = 'deny_all_non_superuser') THEN
    CREATE POLICY "deny_all_non_superuser" ON "FotoMargenCuenta" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
END $$;
