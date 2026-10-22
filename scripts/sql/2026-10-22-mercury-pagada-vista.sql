-- 2026-10-22 · Cuándo la copia de Mercury vio pagada cada factura.
--
-- POR QUÉ. La API de Mercury no dice cuándo se pagó una factura: no trae fecha ni medio de pago, y su `updatedAt` no
-- cambia al pagarse (medido el 22 oct: INV-61 y INV-5-4 tienen el `updatedAt` igual al de creación). Nexus buscaba el
-- depósito en Mercury para saber el día, y eso deja afuera lo que se paga con tarjeta (la plata va a Stripe) o por
-- fuera de Mercury: en 2026, 23 de 50 facturas pagadas (US$63.063) no tienen depósito en Mercury.
-- La copia corre cada hora: cuando ve que una factura pasó a «Paid», guarda el momento (`pagadaVistaEn`) y la última
-- vez que la había visto sin pagar (`pagadaNoVistaEn`). El pago ocurrió entre los dos.
-- Decisión completa: docs/DECISIONS.md › «Mercury: el día del pago cuando no hay depósito».
--
-- QUÉ ENTRA. Dos columnas nullable en "FacturaMercury". Las facturas que ya estaban pagadas quedan en NULL: no se
-- sabe cuándo pasaron a pagadas, y no se inventa.
--
-- ADITIVO y se puede correr dos veces. El código viejo no conoce las columnas y sigue igual.
--
-- Aplicación:
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-10-22-mercury-pagada-vista.sql
--   npx prisma generate   ·   npm run check:invariants

ALTER TABLE "FacturaMercury"
    ADD COLUMN IF NOT EXISTS "pagadaVistaEn"   TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "pagadaNoVistaEn" TIMESTAMP(3);
