-- 2026-10-30 · Éxito del cliente: los motivos de prioridad que crea el equipo
--
-- Pedido de Elías del 30 oct: «Otro motivo» crea un motivo que aparece para los demás. Regla en
-- lib/cs/prioridad-de-cuenta.ts.
--
--   · "MotivoDePrioridad"  el catálogo compartido. `clave` es el nombre en minúsculas y con un espacio entre palabras:
--                          su índice único evita los duplicados que solo cambian en mayúsculas o espacios.
--   · "PrioridadDeCuenta"."motivoDelEquipoId"  qué motivo del catálogo eligió la marca. La fila sigue guardando
--                          motivo = 'otro', así que el CHECK de 2026-10-29-prioridad-de-cuenta.sql no cambia.
--
-- ADITIVO: una tabla nueva y una columna nullable. El código viejo las ignora. Re-ejecutable.
--
-- ⛔ ORDEN: DESPUÉS de 2026-10-29-prioridad-de-cuenta.sql y ANTES del deploy del código que trae el modelo: sin esto,
-- /api/health responde 503 y el deploy se revierte solo.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-30-motivos-de-prioridad.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

BEGIN;

CREATE TABLE IF NOT EXISTS "MotivoDePrioridad" (
  "id"        TEXT NOT NULL,
  "nombre"    TEXT NOT NULL,
  "clave"     TEXT NOT NULL,
  "porEmail"  TEXT NOT NULL,
  "porNombre" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MotivoDePrioridad_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MotivoDePrioridad_clave_key" ON "MotivoDePrioridad" ("clave");

ALTER TABLE "PrioridadDeCuenta" ADD COLUMN IF NOT EXISTS "motivoDelEquipoId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PrioridadDeCuenta_motivoDelEquipoId_fkey') THEN
    ALTER TABLE "PrioridadDeCuenta" ADD CONSTRAINT "PrioridadDeCuenta_motivoDelEquipoId_fkey"
      FOREIGN KEY ("motivoDelEquipoId") REFERENCES "MotivoDePrioridad"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Sin esto, anon la lee con la publishable key del bundle (ARCHITECTURE §4.5).
ALTER TABLE "MotivoDePrioridad" ENABLE ROW LEVEL SECURITY;

COMMIT;
