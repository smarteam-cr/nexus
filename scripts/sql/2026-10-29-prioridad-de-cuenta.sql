-- 2026-10-29 · Éxito del cliente: la cuenta marcada como prioritaria (más seguimiento)
--
-- Pedido de Elías del 29 oct: la CSL y los super admin marcan, desde el listado y desde la cuenta, qué cuentas son
-- prioritarias o necesitan más seguimiento (SmartLoop, ticket grande, interlocutores difíciles u otro motivo). La marca
-- no cambia el color: ordena (dentro del mismo color, la prioritaria va primero). Regla en lib/cs/prioridad-de-cuenta.ts.
--
--   · "PrioridadDeCuenta"  APPEND-ONLY, como "CorreccionDeSalud": cada cambio es una fila y la marca de hoy sale del
--                          último evento. Queda quién la puso y cuándo.
--
-- `tipo` y `motivo` son TEXTO con CHECK y no enums: sumar un motivo no pide `ALTER TYPE … ADD VALUE`.
-- La categoría de alerta «Aviso del equipo» va en OTRO archivo (2026-10-29-aviso-del-equipo.sql): un `ADD VALUE` no se
-- mezcla con nada.
--
-- ADITIVO: una tabla nueva, sin tocar nada existente. Re-ejecutable.
--
-- ⛔ ORDEN: esto va ANTES del deploy del código que trae el modelo: sin la tabla, /api/health responde 503 y el deploy
-- se revierte solo. Sin la tabla (en una base atrasada), la cartera se ve igual y marcar responde 503.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-29-prioridad-de-cuenta.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

BEGIN;

CREATE TABLE IF NOT EXISTS "PrioridadDeCuenta" (
  "id"        TEXT NOT NULL,
  "clientId"  TEXT NOT NULL,
  "tipo"      TEXT NOT NULL,
  "motivo"    TEXT,
  "nota"      TEXT,
  "porEmail"  TEXT NOT NULL,
  "porNombre" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrioridadDeCuenta_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrioridadDeCuenta_clientId_fkey" FOREIGN KEY ("clientId")
    REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrioridadDeCuenta_tipo_check') THEN
    ALTER TABLE "PrioridadDeCuenta" ADD CONSTRAINT "PrioridadDeCuenta_tipo_check"
      CHECK ("tipo" IN ('marcar', 'quitar'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrioridadDeCuenta_motivo_check') THEN
    ALTER TABLE "PrioridadDeCuenta" ADD CONSTRAINT "PrioridadDeCuenta_motivo_check"
      CHECK ("motivo" IS NULL OR "motivo" IN ('smartloop', 'ticket-grande', 'interlocutores-dificiles', 'otro'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PrioridadDeCuenta_clientId_createdAt_idx" ON "PrioridadDeCuenta" ("clientId", "createdAt");

-- Sin esto, anon la lee con la publishable key del bundle (ARCHITECTURE §4.5).
ALTER TABLE "PrioridadDeCuenta" ENABLE ROW LEVEL SECURITY;

COMMIT;
