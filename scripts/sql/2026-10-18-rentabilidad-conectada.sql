-- 2026-10-18 · La rentabilidad, conectada con las agendas y las tareas (iniciativa C de docs/roadmap.md; plan en
-- docs/rentabilidad-conectada-plan.md; DECISIONS «La rentabilidad, conectada con las agendas y las tareas»).
--
-- FotoMargenMes / FotoMargenCuenta: la foto del margen v2 guarda las horas nuevas (reuniones fuera de Meet y tareas
--   internas). Una foto v1 queda con esas columnas en 0: no las tenía.
-- MetaDeFacturacion: la meta de cada año, append-only (la vigente es la última). Nace con la de 2027 (US$2.300.000).
-- PropuestaDeRentabilidad: lo que propone la lectura de los números; una persona la usa o la desestima.
--
-- ADITIVO: 6 columnas con default y 2 tablas nuevas con RLS y una política RESTRICTIVE que niega todo a
-- anon/authenticated (solo las lee Prisma). Interno: montos de dirección.
--
-- ⛔ ORDEN: esto va ANTES del deploy. /api/health responde 503 sin estas columnas y deploy.sh revierte.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-18-rentabilidad-conectada.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`. Se puede correr dos veces.

ALTER TABLE "FotoMargenMes" ADD COLUMN IF NOT EXISTS "horasSinMeet" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "FotoMargenMes" ADD COLUMN IF NOT EXISTS "horasTareas" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "FotoMargenMes" ADD COLUMN IF NOT EXISTS "horasTareasEstimadas" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "FotoMargenCuenta" ADD COLUMN IF NOT EXISTS "horasSinMeet" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "FotoMargenCuenta" ADD COLUMN IF NOT EXISTS "horasTareas" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "FotoMargenCuenta" ADD COLUMN IF NOT EXISTS "horasTareasAgenda" DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "MetaDeFacturacion" (
  "id"          TEXT PRIMARY KEY,
  "anio"        INTEGER NOT NULL,
  "montoUsd"    DECIMAL(14,2) NOT NULL,
  "nota"        TEXT,
  "definidaPor" TEXT NOT NULL,
  "definidaAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "MetaDeFacturacion_anio_definidaAt_idx" ON "MetaDeFacturacion"("anio", "definidaAt");

CREATE TABLE IF NOT EXISTS "PropuestaDeRentabilidad" (
  "id"            TEXT PRIMARY KEY,
  "agentRunId"    TEXT,
  "mes"           TEXT NOT NULL,
  "tipo"          TEXT NOT NULL,
  "clave"         TEXT NOT NULL,
  "clientId"      TEXT,
  "titulo"        TEXT NOT NULL,
  "queVe"         TEXT NOT NULL,
  "propuesta"     TEXT NOT NULL,
  "inversionUsd"  DECIMAL(12,2),
  "inversionNota" TEXT,
  "senal"         JSONB NOT NULL,
  "estado"        TEXT NOT NULL DEFAULT 'pendiente',
  "decididaPor"   TEXT,
  "decididaAt"    TIMESTAMP(3),
  "motivo"        TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "PropuestaDeRentabilidad_estado_createdAt_idx" ON "PropuestaDeRentabilidad"("estado", "createdAt");
CREATE INDEX IF NOT EXISTS "PropuestaDeRentabilidad_agentRunId_idx" ON "PropuestaDeRentabilidad"("agentRunId");
CREATE INDEX IF NOT EXISTS "PropuestaDeRentabilidad_clientId_idx" ON "PropuestaDeRentabilidad"("clientId");
CREATE INDEX IF NOT EXISTS "PropuestaDeRentabilidad_clave_idx" ON "PropuestaDeRentabilidad"("clave");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PropuestaDeRentabilidad_agentRunId_fkey') THEN
    ALTER TABLE "PropuestaDeRentabilidad" ADD CONSTRAINT "PropuestaDeRentabilidad_agentRunId_fkey"
      FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PropuestaDeRentabilidad_clientId_fkey') THEN
    ALTER TABLE "PropuestaDeRentabilidad" ADD CONSTRAINT "PropuestaDeRentabilidad_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PropuestaDeRentabilidad_estado_check') THEN
    ALTER TABLE "PropuestaDeRentabilidad" ADD CONSTRAINT "PropuestaDeRentabilidad_estado_check"
      CHECK ("estado" IN ('pendiente', 'usado', 'desestimado'));
  END IF;
  -- Usada o desestimada, siempre con quién y cuándo.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PropuestaDeRentabilidad_decidida_check') THEN
    ALTER TABLE "PropuestaDeRentabilidad" ADD CONSTRAINT "PropuestaDeRentabilidad_decidida_check"
      CHECK ("estado" = 'pendiente' OR ("decididaPor" IS NOT NULL AND "decididaAt" IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PropuestaDeRentabilidad_mes_check') THEN
    ALTER TABLE "PropuestaDeRentabilidad" ADD CONSTRAINT "PropuestaDeRentabilidad_mes_check" CHECK ("mes" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MetaDeFacturacion_monto_check') THEN
    ALTER TABLE "MetaDeFacturacion" ADD CONSTRAINT "MetaDeFacturacion_monto_check" CHECK ("montoUsd" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MetaDeFacturacion_anio_check') THEN
    ALTER TABLE "MetaDeFacturacion" ADD CONSTRAINT "MetaDeFacturacion_anio_check" CHECK ("anio" BETWEEN 2020 AND 2100);
  END IF;
END $$;

-- La meta de 2027 que dijo Marco en la reunión del 17 oct. Solo si el año todavía no tiene una.
INSERT INTO "MetaDeFacturacion" ("id", "anio", "montoUsd", "nota", "definidaPor", "definidaAt")
SELECT 'meta-2027-inicial', 2027, 2300000, 'La meta que dijo Marco en la reunión del 17 oct: US$2,3 millones en 2027, entre facturación y comisiones.', 'egonzalez@smarteamcr.com', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "MetaDeFacturacion" WHERE "anio" = 2027);

ALTER TABLE "MetaDeFacturacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PropuestaDeRentabilidad" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'MetaDeFacturacion' AND policyname = 'deny_all_non_superuser') THEN
    CREATE POLICY "deny_all_non_superuser" ON "MetaDeFacturacion" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'PropuestaDeRentabilidad' AND policyname = 'deny_all_non_superuser') THEN
    CREATE POLICY "deny_all_non_superuser" ON "PropuestaDeRentabilidad" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
  END IF;
END $$;
