-- 2026-07-27 · IngresoVariable: entradas de dinero fuera del ciclo de cobranza
--
-- ADITIVO: 1 tabla + 2 índices + 1 FK. No borra nada, no inserta nada.
--
-- POR QUÉ UNA TABLA Y NO UN `Cobro`: el schema de Cobro exige `servicioId` y
-- `cuentaId` OBLIGATORIOS. Un ingreso "de forma general" (sin cliente, o de un
-- cliente sin servicio configurado) no entra ahí sin inventarle un servicio
-- fantasma que ensuciaría cartera, semáforo y proyección.
--
-- ⚠ SE APLICA A MANO, NUNCA con `db push` / `db:sync`: el `migrate diff` de hoy
-- trae además un `DROP INDEX "ProjectCanvas_projectId_slug_key"` que es deriva
-- viva de la otra PC — un push lo borraría.
--
-- Cómo aplicarlo (revisá antes de correr):
--   npx prisma db execute --file scripts/sql/2026-07-27-ingreso-variable.sql --schema prisma/schema.prisma
-- Después, EN ESTE ORDEN:
--   npx prisma generate      (NO `db:sync`)
--   reiniciar el dev server  (el client viejo no conoce la tabla → falla en silencio)

BEGIN;

CREATE TABLE IF NOT EXISTS "IngresoVariable" (
    "id"            TEXT NOT NULL,
    "concepto"      TEXT NOT NULL,
    "monto"         DECIMAL(12,2) NOT NULL,
    "moneda"        "CobranzaMoneda" NOT NULL,
    "fecha"         DATE NOT NULL,
    -- nullable a propósito: el ingreso puede no tener cliente ("de forma general").
    "clientId"      TEXT,
    "notas"         TEXT,
    "registradoPor" TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- SIN default: `@updatedAt` lo escribe el cliente Prisma en cada write, y es
    -- así como lo crea `db push` en el resto de las tablas. Un default acá deja
    -- una línea permanente en `migrate diff` que taparía una deriva real.
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IngresoVariable_pkey" PRIMARY KEY ("id")
);

-- Idempotente: no-op en una tabla recién creada; corrige la primera aplicación,
-- que sí traía el default.
ALTER TABLE "IngresoVariable" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "IngresoVariable_fecha_idx" ON "IngresoVariable"("fecha");
CREATE INDEX IF NOT EXISTS "IngresoVariable_clientId_idx" ON "IngresoVariable"("clientId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IngresoVariable_clientId_fkey') THEN
    ALTER TABLE "IngresoVariable"
      ADD CONSTRAINT "IngresoVariable_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id")
      -- SetNull: borrar un cliente NUNCA borra el registro de que esa plata entró.
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ⚠ OBLIGATORIO — `db push` NO habilita RLS y Supabase auto-otorga GRANT SELECT a
-- `anon` sobre todo `public`: sin esto, los montos serían leíbles con la
-- publishable key que viaja en el bundle del browser. Sin policy SELECT =
-- lock-down total (mismo trato que Cobro y CuentaFinanciera).
ALTER TABLE "IngresoVariable" ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verificación:
--   SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'IngresoVariable'; -- true
--   SELECT count(*) FROM "IngresoVariable";                                            -- 0
