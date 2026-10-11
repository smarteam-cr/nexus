-- 2026-10-07 — Solicitudes fuera de alcance: el seguimiento (Elías).
--
-- La tabla «PedidoFueraDeAlcance» existe desde el 2026-10-02 (la llena la lectura de cada reunión).
-- Ahora el CSE confirma o descarta cada una, les da seguimiento desde «La cuenta» de la ficha y puede
-- sumar las que no salieron de una reunión. Para eso, tres columnas:
--   · nota       — el seguimiento que escribe el CSE (en qué quedó, qué falta).
--   · historial  — [{ estado, por, en, nota? }]: cada cambio, con quién y cuándo.
--   · creadoPor  — el correo de quien la sumó a mano; null = la detectó la lectura de una reunión.
-- Los estados nuevos (CONFIRMADO, RECHAZADO) son texto: no hace falta tocar un enum.
--
-- SOLO ADITIVO e inocuo para el código anterior (que no lee estas columnas). Re-ejecutable.
-- Aplicar ANTES del deploy:
--   $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-07-solicitudes-fuera-de-alcance.sql; Remove-Item Env:ALLOW_PROD_WRITE

ALTER TABLE "PedidoFueraDeAlcance" ADD COLUMN IF NOT EXISTS "nota" TEXT;
ALTER TABLE "PedidoFueraDeAlcance" ADD COLUMN IF NOT EXISTS "historial" JSONB;
ALTER TABLE "PedidoFueraDeAlcance" ADD COLUMN IF NOT EXISTS "creadoPor" TEXT;
