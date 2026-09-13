-- 2026-09-12 · Etapa 4 · Cada monto del espejo de Odoo en su moneda
--
-- ── POR QUÉ ────────────────────────────────────────────────────────────────────────
-- `montoTotalSigned` promete «el total con signo» de la factura, y el sync le guardaba el
-- `amount_total_signed` de Odoo. Ese campo NO está en la moneda del documento: está en la de la
-- COMPAÑÍA, colones. Medido hoy contra la base: 318 de las 318 facturas en dólares tienen ahí el
-- monto en colones (FAC/2026/0332: total 15.226,75 USD, «con signo» 6.905.331,13), o sea
-- ₡241.275.597,97 guardados en filas cuya columna `moneda` dice USD. Ninguna pantalla lo lee
-- todavía; el primero que sume «facturas menos notas de crédito» con ese campo iba a leer 450
-- veces la venta.
--
-- Qué hace este archivo, en este orden:
--   1. `montoMonedaCompania`, copiando el valor actual. No se borra: es la única evidencia del tipo
--      de cambio con que el contador registró cada factura.
--   2. `montoTotalSigned` = el total, negativo en las notas de crédito. El signo se DERIVA del tipo
--      de documento: medido, coincide con el que traía Odoo en 347 de 347 filas.
--   3. El control `FacturaOdoo_signo_del_documento`, para que no vuelva a pasar.
--
-- ⚠⚠ VA ANTES QUE LA CREDENCIAL DE ODOO. Con el control puesto, el código anterior NO puede
-- volver a escribir colones en una fila USD: la corrida falla, queda en rojo y guarda el error
-- (lo ve Integraciones y /integrations/odoo). Sin el control, las 13 facturas de septiembre
-- entrarían con el mismo defecto.
--
-- ⚠ Y va ANTES que el deploy del código de la etapa 4: el sync nuevo escribe `montoMonedaCompania`
-- y, sin la columna, cada corrida falla. Las pantallas no se caen (leen con `select` explícito).
--
-- Aditivo e idempotente: se puede correr dos veces, y si se corta a mitad se vuelve a correr.
--   · el paso 1 copia solo donde la columna está vacía;
--   · el paso 2 solo toca filas cuyo signo no coincide (en la segunda pasada, ninguna);
--   · el paso 3 se borra y se vuelve a crear.
-- ⚠ El paso 1 SIEMPRE antes del 2: al revés, se copiaría el monto ya corregido y la evidencia del
-- tipo de cambio se perdería. Por eso van en este archivo y en este orden.
--
-- Aplicar con:  ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-12-4-espejo-odoo-moneda-del-documento.sql --schema prisma/schema.prisma
-- Después:      npx prisma generate   (NUNCA db push)  ·  npm run check:invariants → INV23 en verde

-- ── 1. La evidencia del tipo de cambio ─────────────────────────────────────────────
ALTER TABLE "FacturaOdoo" ADD COLUMN IF NOT EXISTS "montoMonedaCompania" DECIMAL(14,2);

UPDATE "FacturaOdoo"
   SET "montoMonedaCompania" = "montoTotalSigned"
 WHERE "montoMonedaCompania" IS NULL;

-- ── 2. El total con signo, en la moneda del documento ──────────────────────────────
UPDATE "FacturaOdoo"
   SET "montoTotalSigned" = CASE WHEN "moveType" = 'out_refund' THEN -"montoTotal" ELSE "montoTotal" END
 WHERE "montoTotalSigned" IS DISTINCT FROM
       (CASE WHEN "moveType" = 'out_refund' THEN -"montoTotal" ELSE "montoTotal" END);

-- ── 3. El control ───────────────────────────────────────────────────────────────────
-- Un céntimo de tolerancia, igual que INV23: Odoo hace la aritmética en float. La regla es la de
-- `montoConSigno()` en lib/cobranza/odoo/espejo.ts; si cambia una, cambia la otra.
ALTER TABLE "FacturaOdoo" DROP CONSTRAINT IF EXISTS "FacturaOdoo_signo_del_documento";
ALTER TABLE "FacturaOdoo" ADD CONSTRAINT "FacturaOdoo_signo_del_documento"
    CHECK (ABS("montoTotalSigned" - CASE WHEN "moveType" = 'out_refund' THEN -"montoTotal" ELSE "montoTotal" END) <= 0.01);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado: 347 | 0 | 318.
--   SELECT COUNT(*)                                                             AS filas,
--          COUNT(*) FILTER (WHERE "montoMonedaCompania" IS NULL)                AS sin_evidencia,
--          COUNT(*) FILTER (WHERE "moneda" = 'USD'
--                             AND ABS("montoMonedaCompania") > "montoTotal" + 0.01) AS usd_con_colones_de_evidencia
--     FROM "FacturaOdoo";
