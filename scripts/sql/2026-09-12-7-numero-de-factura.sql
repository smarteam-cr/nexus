-- 2026-09-12 · Etapa 7 · La factura tiene número desde que nace
--
-- ── POR QUÉ ────────────────────────────────────────────────────────────────────────
-- «Marcar facturado» pedía solo la fecha. El número de la factura se podía pegar recién al
-- REGISTRAR EL PAGO, en `referenciaExterna`, un campo que también guarda ids de transferencias de
-- Mercury. Medido hoy contra la base: 144 cobros facturados (17 por cobrar, 11 programados y 116
-- cobrados) y NINGUNO con su número de factura. Justo lo facturado y no cobrado —lo que hay que
-- perseguir— llegaba siempre sin él, y el cruce contra Odoo tenía que adivinar por monto.
--
-- Qué agrega, todo en `Cobro` y todo nullable (ningún cobro viejo cambia):
--   · `numeroFactura`           el número del documento (FAC/2026/0206, INV-16…), normalizado.
--   · `numeroFacturaPor/En`     quién lo puso y cuándo. Mismo patrón que facturadoPor/En (INV5).
--   · `sinNumeroFacturaMotivo`  la marca «no tengo el número», con su motivo. Consultable: una
--                               factura sin número y con motivo es una decisión; sin motivo, un
--                               olvido.
--   · un índice solo por `numeroFactura`: el chokepoint busca el número en otras cuentas antes de
--     guardarlo (409), y la etapa 8 cruza por número.
--   · el control `Cobro_numero_o_marca`: el número y la marca no conviven.
--
-- ⚠ NO es único. El mismo número puede estar en varios cobros de la MISMA cuenta: una factura que
-- cubre varias cuotas. Lo que no puede pasar —el mismo documento en dos cuentas— lo frena el
-- chokepoint con un 409 y lo vigila INV33.
--
-- Sin tabla nueva: `prisma/policies.sql` no cambia.
--
-- ⚠⚠ VA ANTES QUE EL DEPLOY DE LA ETAPA 7. Prisma lee TODAS las columnas del modelo cuando una
-- consulta no dice cuáles, y el chokepoint de los cobros (`cambiarEstadoCobroTx`), el cronograma de
-- la cuenta y la planificación de cobros leen así: con el código nuevo y sin estas columnas, marcar
-- facturado, registrar un pago, abrir una cuenta y generar cobros dan error. Al revés no pasa nada:
-- el código viejo no nombra estas columnas y sigue andando con ellas puestas.
--
-- Aditivo e idempotente: se puede correr dos veces, y si se corta a mitad se vuelve a correr.
--
-- Aplicar con:  ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-12-7-numero-de-factura.sql --schema prisma/schema.prisma
-- Después:      npx prisma generate   (NUNCA db push)  ·  npm run check:invariants → INV33 e INV34 en verde

-- ── 1. Las columnas ─────────────────────────────────────────────────────────────────
ALTER TABLE "Cobro" ADD COLUMN IF NOT EXISTS "numeroFactura" TEXT;
ALTER TABLE "Cobro" ADD COLUMN IF NOT EXISTS "numeroFacturaPor" TEXT;
ALTER TABLE "Cobro" ADD COLUMN IF NOT EXISTS "numeroFacturaEn" TIMESTAMP(3);
ALTER TABLE "Cobro" ADD COLUMN IF NOT EXISTS "sinNumeroFacturaMotivo" TEXT;

-- ── 2. El índice por número ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Cobro_numeroFactura_idx" ON "Cobro"("numeroFactura");

-- ── 3. El control ───────────────────────────────────────────────────────────────────
-- La regla es la de `decidirNumeroFactura()` en lib/cobranza/numero-factura.ts: poner el número
-- quita la marca y marcar «no tengo el número» quita el número. Si cambia una, cambia la otra.
ALTER TABLE "Cobro" DROP CONSTRAINT IF EXISTS "Cobro_numero_o_marca";
ALTER TABLE "Cobro" ADD CONSTRAINT "Cobro_numero_o_marca"
    CHECK ("numeroFactura" IS NULL OR "sinNumeroFacturaMotivo" IS NULL);

-- ── Verificación (solo lectura, correr aparte) ─────────────────────────────────────
-- Esperado hoy: 144 | 0 | 0.
--   SELECT COUNT(*) FILTER (WHERE "fechaEmision" IS NOT NULL)            AS facturados,
--          COUNT(*) FILTER (WHERE "numeroFactura" IS NOT NULL)           AS con_numero,
--          COUNT(*) FILTER (WHERE "sinNumeroFacturaMotivo" IS NOT NULL)  AS sin_numero_con_motivo
--     FROM "Cobro";
