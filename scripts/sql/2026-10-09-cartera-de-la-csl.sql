-- 2026-10-09 · Éxito del cliente: el color corregido a mano, el «en espera del cliente» y las vistas guardadas
--
-- Entregas 2 y 3 de docs/exito-del-cliente-cartera-plan.md (pedido de Elías para Alexander Vanegas, CSL):
--
--   · "CorreccionDeSalud"  la CSL (o un super admin) corrige el color de una cuenta con una razón corta, y marca o
--                          quita el «en espera del cliente». APPEND-ONLY: cada cambio es una fila y el estado sale
--                          del último evento de cada clase (lib/cs/ajustes-de-salud.ts). Una corrección vale 30
--                          días o hasta que Nexus vea una razón roja nueva.
--   · "VistaDeCartera"     una vista guardada de la pestaña «Cartera»: un nombre y sus filtros. Compartida entre la
--                          CSL y dirección; solo quien la creó la borra.
--
-- `tipo` es TEXTO con CHECK y no un enum: sumar una clase no pide `ALTER TYPE … ADD VALUE`.
-- La categoría de alerta «Queja del cliente» va en OTRO archivo (2026-10-09-queja-del-cliente.sql): un `ADD VALUE`
-- no se mezcla con nada.
--
-- ADITIVO: dos tablas nuevas, sin tocar nada existente. Re-ejecutable.
--
-- ⛔ ORDEN: esto va ANTES del deploy del código que trae los modelos: sin las tablas, /api/health responde 503 y el
-- deploy se revierte solo.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-09-cartera-de-la-csl.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

BEGIN;

CREATE TABLE IF NOT EXISTS "CorreccionDeSalud" (
  "id"             TEXT NOT NULL,
  "clientId"       TEXT NOT NULL,
  "tipo"           TEXT NOT NULL,
  "salud"          TEXT,
  "nota"           TEXT,
  "saludDeNexus"   TEXT,
  "razonesDeNexus" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "huella"         TEXT,
  "porEmail"       TEXT NOT NULL,
  "porNombre"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CorreccionDeSalud_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CorreccionDeSalud_clientId_fkey" FOREIGN KEY ("clientId")
    REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CorreccionDeSalud_tipo_check') THEN
    ALTER TABLE "CorreccionDeSalud" ADD CONSTRAINT "CorreccionDeSalud_tipo_check"
      CHECK ("tipo" IN ('corregir', 'quitar-correccion', 'en-espera', 'quitar-espera', 'descartar-espera'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "CorreccionDeSalud_clientId_createdAt_idx" ON "CorreccionDeSalud" ("clientId", "createdAt");

CREATE TABLE IF NOT EXISTS "VistaDeCartera" (
  "id"              TEXT NOT NULL,
  "nombre"          TEXT NOT NULL,
  "filtros"         JSONB NOT NULL DEFAULT '{}',
  "creadaPorEmail"  TEXT NOT NULL,
  "creadaPorNombre" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VistaDeCartera_pkey" PRIMARY KEY ("id")
);

-- Internas: nadie las lee con la clave pública.
ALTER TABLE "CorreccionDeSalud" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "CorreccionDeSalud";
CREATE POLICY deny_all_non_superuser ON "CorreccionDeSalud" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

ALTER TABLE "VistaDeCartera" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "VistaDeCartera";
CREATE POLICY deny_all_non_superuser ON "VistaDeCartera" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

COMMIT;
