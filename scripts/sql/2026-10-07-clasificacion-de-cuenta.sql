-- 2026-10-07 · La clasificación de cada cuenta de la cartera (Éxito del cliente, entrega 1)
--
-- Pedido de Elías: que Alexander Vanegas (CSL) clasifique cada cuenta por tipo de relación, potencial para
-- Smarteam y momento de la cuenta. Nexus PROPONE cada valor con lo que ya sabe (lib/cs/clasificacion.ts, se
-- calcula al leer y no se guarda) y la CSL lo confirma o lo cambia: esta tabla guarda solo lo CONFIRMADO, quién y
-- cuándo, y lo DESCARTADO (el valor propuesto y la razón con que se propuso), para no volver a proponerlo hasta
-- que cambie la razón. El CSE responsable no va acá: es el de HubSpot y se cambia con el pase de cuenta.
--
-- Los valores son TEXTO y no enum: sumar uno es una línea en lib/cs/clasificacion.ts, sin ALTER TYPE.
-- Plan: docs/exito-del-cliente-cartera-plan.md.
--
-- ADITIVO: una tabla nueva, sin tocar nada existente. Re-ejecutable.
--
-- ⛔ ORDEN: esto va ANTES del deploy del código que trae el modelo `ClasificacionDeCuenta`: sin la tabla,
-- /api/health responde 503 y el deploy se revierte solo.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-07-clasificacion-de-cuenta.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

BEGIN;

CREATE TABLE IF NOT EXISTS "ClasificacionDeCuenta" (
  "clientId"     TEXT NOT NULL,
  "relacion"     TEXT,
  "relacionPor"  TEXT,
  "relacionEn"   TIMESTAMP(3),
  "potencial"    TEXT,
  "potencialPor" TEXT,
  "potencialEn"  TIMESTAMP(3),
  "momento"      TEXT,
  "momentoPor"   TEXT,
  "momentoEn"    TIMESTAMP(3),
  "descartes"    JSONB NOT NULL DEFAULT '{}',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClasificacionDeCuenta_pkey" PRIMARY KEY ("clientId"),
  CONSTRAINT "ClasificacionDeCuenta_clientId_fkey" FOREIGN KEY ("clientId")
    REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Interna: nadie la lee con la clave pública.
ALTER TABLE "ClasificacionDeCuenta" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "ClasificacionDeCuenta";
CREATE POLICY deny_all_non_superuser ON "ClasificacionDeCuenta" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

COMMIT;
