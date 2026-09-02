-- 2026-09-03 · Que el espejo pueda registrar dos cambios que hoy pierde en silencio
--
-- ADITIVA E INOCUA. Agrega dos valores de enum y una columna con default; el código viejo que
-- corre en el VPS no los usa y no se entera.
--
-- ── POR QUÉ ────────────────────────────────────────────────────────────────────────
-- `calcularDeltas` comparaba montoTotal, residual, estados, fecha y cuenta — pero NO montoNeto
-- ni moneda. Y como el UPDATE de la factura solo corre cuando hay algún delta, una corrección
-- de esos dos campos en Odoo **nunca llegaba al espejo**: la fila se quedaba con el valor viejo
-- para siempre, en silencio.
--
-- ⚠ `montoNeto` es justamente el campo que se compara contra `Cobro.monto` (los cobros están
-- cargados sin IVA). O sea que el descuadre que el espejo existe para detectar era el que no
-- podía ver.
--
-- Y `rechazadas` da superficie a las facturas que el mapeo no pudo leer. Antes ese número solo
-- salía al log del contenedor: una factura sin fecha o sin partner se congelaba y nadie lo veía.
--
-- ── APLICACIÓN ─────────────────────────────────────────────────────────────────────
--   1. git pull                                     (la base la comparten 2 PCs)
--   2. ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-03-espejo-odoo-deltas.sql
--   3. Los ALTER TYPE van APARTE: no corren en transacción y no pasan por db execute.
--      Ver el one-liner con assertProdWriteAllowed() abajo.
--   4. npx prisma generate                          (NUNCA db push)
--   5. reiniciar el dev server
--
-- ⚠ Los dos ALTER TYPE de abajo NO se pueden ejecutar acá dentro. Van por el one-liner:
--   ALTER TYPE "FacturaOdooCambioTipo" ADD VALUE IF NOT EXISTS 'NETO';
--   ALTER TYPE "FacturaOdooCambioTipo" ADD VALUE IF NOT EXISTS 'MONEDA';

-- Cuántas facturas devolvió Odoo que el espejo no pudo leer. 0 es lo normal.
ALTER TABLE "SyncOdooCorrida" ADD COLUMN IF NOT EXISTS "rechazadas" INTEGER NOT NULL DEFAULT 0;

-- El detalle de POR QUÉ se rechazaron. Sin esto el contador dice que pasó algo y no qué.
ALTER TABLE "SyncOdooCorrida" ADD COLUMN IF NOT EXISTS "detalleRechazos" TEXT;
