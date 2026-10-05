-- 2026-10-05 · Punto de equilibrio para RevOps, CFO y CEO: las decisiones de dirección se toman desde la página
--
-- Pedido de Elías (2026-10-05, «Aplícalo con tu propuesta»): el punto de equilibrio lista lo que hay que decidir, cada
-- cosa con quien la decide. La primera decisión que se toma ahí es si lo que pagan los aliados cuenta para cubrir el piso
-- (hasta hoy, una constante en el código esperando la respuesta de dirección: `PARTNERSHIP_CUBRE_EL_PISO`).
--
-- ADITIVO: una tabla nueva. Nada existente cambia. Re-ejecutable.
--
-- ⛔ ORDEN: esto va ANTES del deploy. El reporte anual la lee en cada carga del punto de equilibrio y del cierre del mes.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-05-decisiones-de-finanzas.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

BEGIN;

-- Una fila por decisión, con quién la tomó y cuándo. Sin fila = todavía no se decidió (manda el valor por defecto del
-- código, que la página muestra como «sin decidir»).
CREATE TABLE IF NOT EXISTS "DecisionFinanzas" (
  "clave"       TEXT NOT NULL,
  "valor"       TEXT NOT NULL,
  "decididoPor" TEXT NOT NULL,
  "decididoEn"  TIMESTAMP(3) NOT NULL,
  "nota"        TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DecisionFinanzas_pkey" PRIMARY KEY ("clave"),
  CONSTRAINT "DecisionFinanzas_clave_check" CHECK ("clave" ~ '^[a-z0-9-]{1,60}$'),
  -- La única que existe hoy: si los aliados cubren el piso. SI o NO, nada más.
  CONSTRAINT "DecisionFinanzas_aliados_check" CHECK ("clave" <> 'aliados-cubren-piso' OR "valor" IN ('SI', 'NO'))
);

ALTER TABLE "DecisionFinanzas" ENABLE ROW LEVEL SECURITY;

COMMIT;
