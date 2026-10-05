-- 2026-10-05 · El tipo de cambio de cada día, del Banco Central
--
-- Pedido de Elías (2026-10-05): «no debería usar ₡500, sino el API del Banco Central o un lugar seguro en Costa Rica
-- para identificar el tipo de cambio por día e irlo guardando para todas las transacciones». Una fila por día con la
-- venta (la que se usa) y la compra (solo se muestra) de referencia del BCCR. La llena el job diario
-- `tipo-cambio-daily` y, la primera vez, `scripts/traer-tipo-de-cambio.ts` con el histórico.
--
-- ADITIVO: una tabla nueva. `TipoCambioMes` no se toca: queda de respaldo para los meses sin días traídos. Re-ejecutable.
--
-- ⛔ ORDEN: esto va ANTES del deploy. El punto de equilibrio y el cierre del mes la leen en cada carga.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-05-tipo-de-cambio-diario.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

BEGIN;

CREATE TABLE IF NOT EXISTS "TipoCambioDia" (
  "fecha"     TEXT NOT NULL,
  "venta"     DECIMAL(12,4) NOT NULL,
  "compra"    DECIMAL(12,4),
  "fuente"    TEXT NOT NULL,
  "traidoEn"  TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TipoCambioDia_pkey" PRIMARY KEY ("fecha"),
  CONSTRAINT "TipoCambioDia_fecha_check" CHECK ("fecha" ~ '^\d{4}-\d{2}-\d{2}$'),
  -- Una tasa fuera de esto es una respuesta rota (o en otra unidad): no entra.
  CONSTRAINT "TipoCambioDia_venta_check" CHECK ("venta" BETWEEN 100 AND 2000),
  CONSTRAINT "TipoCambioDia_compra_check" CHECK ("compra" IS NULL OR "compra" BETWEEN 100 AND 2000),
  CONSTRAINT "TipoCambioDia_fuente_check" CHECK ("fuente" IN ('BCCR', 'HACIENDA'))
);

ALTER TABLE "TipoCambioDia" ENABLE ROW LEVEL SECURITY;

COMMIT;
