-- 2026-10-06 · Las cuotas de comisión de cada vendedor, venta por venta y mes por mes
--
-- Pedido de Elías (2026-10-06): importar el historial de comisiones del año desde el Excel de cada vendedor (la «Tabla
-- de Comisiones»: una fila por venta, una columna por mes) y que lo dudoso lo confirmen Dinia o Alex con un botón. Es la
-- base del módulo de comisiones nuevo. Modelo `CuotaComisionVendedor` (prisma/schema.prisma).
--
-- ADITIVO: una tabla nueva, sin tocar nada existente. Re-ejecutable.
--
-- ⛔ ORDEN: esto va ANTES del deploy del código que trae el modelo. Sin la tabla, la página de comisiones de vendedor
-- muestra el aviso de «falta el SQL» en la sección del historial (no se cae), y el importador no puede escribir.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-06-cuotas-comision-vendedor.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

BEGIN;

CREATE TABLE IF NOT EXISTS "CuotaComisionVendedor" (
  "id"            TEXT NOT NULL,
  "teamMemberId"  TEXT NOT NULL,
  "ventaClave"    TEXT NOT NULL,
  "cliente"       TEXT NOT NULL,
  "tipoVenta"     TEXT NOT NULL,
  "porcentaje"    DECIMAL(6,4) NOT NULL,
  "montoContrato" DECIMAL(12,2),
  "montoComision" DECIMAL(12,2),
  "fechaIngreso"  DATE,
  "periodo"       TEXT NOT NULL,
  "monto"         DECIMAL(12,2) NOT NULL,
  "moneda"        "CobranzaMoneda" NOT NULL DEFAULT 'USD',
  "estado"        TEXT NOT NULL DEFAULT 'POR_CONFIRMAR',
  "confirmadoPor" TEXT,
  "confirmadoEn"  TIMESTAMP(3),
  "origen"        TEXT NOT NULL,
  "detalle"       JSONB,
  "notas"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CuotaComisionVendedor_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CuotaComisionVendedor_estado_check" CHECK ("estado" IN ('PAGADA', 'NO_PAGADA', 'POR_CONFIRMAR')),
  CONSTRAINT "CuotaComisionVendedor_tipoVenta_check" CHECK ("tipoVenta" IN ('SERVICIO', 'LICENCIA')),
  CONSTRAINT "CuotaComisionVendedor_periodo_check" CHECK ("periodo" ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

CREATE UNIQUE INDEX IF NOT EXISTS "CuotaComisionVendedor_teamMemberId_ventaClave_periodo_key"
  ON "CuotaComisionVendedor"("teamMemberId", "ventaClave", "periodo");
CREATE INDEX IF NOT EXISTS "CuotaComisionVendedor_periodo_idx" ON "CuotaComisionVendedor"("periodo");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CuotaComisionVendedor_teamMemberId_fkey') THEN
    ALTER TABLE "CuotaComisionVendedor"
      ADD CONSTRAINT "CuotaComisionVendedor_teamMemberId_fkey"
      FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Remuneración: nadie la lee con la clave pública (mismo trato que ComisionVendedor en prisma/policies.sql).
ALTER TABLE "CuotaComisionVendedor" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_all_non_superuser ON "CuotaComisionVendedor";
CREATE POLICY deny_all_non_superuser ON "CuotaComisionVendedor" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

COMMIT;
