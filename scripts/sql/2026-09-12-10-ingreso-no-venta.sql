-- 2026-09-12 · Etapa 10 · La plata que no es venta tiene casillero
--
-- ── POR QUÉ ────────────────────────────────────────────────────────────────────────
-- El fondo de marketing de Insider (INV-26 + INV-27, US$5.346,91, depositados el 30-jun y el 7-jul)
-- entró al banco y NO es venta a un cliente: es presupuesto de un aliado. El Compendio lo cuenta
-- como venta, y en Nexus no tenía dónde caer: como cobro inflaba lo facturado y el % de cobranza, y
-- como comisión de aliado sumaba al punto de equilibrio. `IngresoVariable` pasa a ser el casillero
-- de la plata que no es venta: el reporte de equilibrio la suma a la caja y a nada más.
--
-- Qué agrega, todo en `IngresoVariable` y todo nullable (ninguna fila vieja cambia; hoy hay 0):
--   · `categoria`          qué clase de plata es. NULL = sin clasificar, y el reporte la lista en
--                          «Lo que no cuadra». ⚠ TEXT y no un enum A PROPÓSITO: el nombre de la
--                          categoría del fondo de aliado lo deciden Elías y Claudia, y sumarlo no
--                          puede exigir un `ALTER TYPE … ADD VALUE` (que además no corre en una
--                          transacción). Los valores válidos los fija la app, en
--                          lib/cobranza/ingresos-no-venta.ts; uno que no conoce se lee como sin
--                          clasificar.
--   · `referenciaExterna`  el número del documento o del depósito (INV-26), normalizado. Con él el
--                          alta frena la misma factura ya cargada como cobro (409) y INV35 vigila
--                          el dato. No es único: una factura puede entrar en dos depósitos.
-- `fecha` sigue siendo el día en que entró la plata.
--
-- Sin índice: la tabla es chica y se lee entera. Sin tabla nueva: `prisma/policies.sql` no cambia
-- (`IngresoVariable` ya tiene RLS desde scripts/sql/2026-07-27-ingreso-variable.sql).
--
-- ⚠ VA ANTES QUE EL DEPLOY DE LA ETAPA 10. Con el código nuevo y sin estas columnas, Ingresos
-- variables y el reporte de equilibrio no se caen (avisan que falta este archivo), pero registrar o
-- editar un ingreso da 503 y INV35 sale «no verificable». Al revés no pasa nada: el código viejo no
-- nombra estas columnas.
--
-- Aditivo e idempotente: se puede correr dos veces, y si se corta a mitad se vuelve a correr.
--
-- Aplicar con:  ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-12-10-ingreso-no-venta.sql --schema prisma/schema.prisma
-- Después:      npx prisma generate   (NUNCA db push)  ·  npm run check:invariants → INV35 en verde

BEGIN;

ALTER TABLE "IngresoVariable" ADD COLUMN IF NOT EXISTS "categoria" TEXT;
ALTER TABLE "IngresoVariable" ADD COLUMN IF NOT EXISTS "referenciaExterna" TEXT;

COMMIT;

-- Verificación:
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_name = 'IngresoVariable' AND column_name IN ('categoria', 'referenciaExterna');
--   → 2 filas, text, YES
