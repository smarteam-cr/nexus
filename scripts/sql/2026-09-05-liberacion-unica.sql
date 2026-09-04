-- 2026-09-05 · Una factura no se suelta dos veces
--
-- ── POR QUÉ ─────────────────────────────────────────────────────────────────────
-- `liberarYRegenerar` ya rechaza el mismo `cobroId` repetido dentro de un pedido, pero eso solo
-- cubre el cuerpo mal armado. La carrera real queda afuera: `planificarCobros` y la comparación
-- de huella corren FUERA de la transacción y sin bloqueo de fila, así que dos confirmaciones
-- concurrentes —dos pestañas, un reintento de red— leen las dos el mismo estado previo, las dos
-- pasan las validaciones, y las dos insertan.
--
-- El resultado son dos líneas de trabajo hacia el ERP por el MISMO documento, con instrucciones
-- que se contradicen: una dice anularlo y la otra emitirle nota de crédito. Quien las lea no
-- tiene forma de saber cuál vale.
--
-- ⚠ Parcial, sobre `resueltaEn IS NULL`. No es un detalle: si el índice fuera total, una factura
-- soltada, anulada y cerrada bloquearía para siempre volver a soltar ese cobro si más adelante
-- se le emite una factura nueva. Lo que no puede haber es DOS ABIERTAS a la vez.
--
-- ⚠⚠ `cobroId` es nullable a propósito (el cobro se borra al regenerar y el rastro de la factura
-- que hay que anular no puede irse con él). En Postgres los NULL no chocan entre sí en un índice
-- único, así que las filas huérfanas no se estorban — que es exactamente lo que se quiere.
--
-- Idempotente: se puede correr dos veces.
--
-- Aplicar con:  ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-05-liberacion-unica.sql --schema prisma/schema.prisma

CREATE UNIQUE INDEX IF NOT EXISTS "FacturaLiberada_cobroId_abierta_key"
  ON "FacturaLiberada" ("cobroId")
  WHERE "resueltaEn" IS NULL AND "cobroId" IS NOT NULL;
