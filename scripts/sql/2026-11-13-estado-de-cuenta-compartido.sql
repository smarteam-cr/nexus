-- 2026-11-13 · El estado de cuenta compartido (pedido 17): el enlace con que la persona de finanzas del cliente ve su
-- estado de cuenta en vivo, en /external/estado-de-cuenta/[token].
--
-- Una tabla nueva, SOLO ADITIVA, inocua para el código viejo:
--   "AccesoAlEstadoDeCuenta": uno por cuenta de Cobranza (CuentaFinanciera); revocable y con fecha de vencimiento.
--   Con RLS y sin policies (lock-down, ARCHITECTURE §4.5): solo Prisma la lee.
--
-- Se puede correr dos veces. Va ANTES del deploy del código que la usa.
--
-- Volver atrás (borra lo nuevo; con revisión):
--   DROP TABLE IF EXISTS "AccesoAlEstadoDeCuenta";
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-11-13-estado-de-cuenta-compartido.sql; Remove-Item Env:ALLOW_PROD_WRITE

CREATE TABLE IF NOT EXISTS "AccesoAlEstadoDeCuenta" (
  "id"          TEXT NOT NULL,
  "cuentaId"    TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "enabledAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "venceEn"     TIMESTAMP(3) NOT NULL,
  "revokedAt"   TIMESTAMP(3),
  "revocadoPor" TEXT,
  "lastUsedAt"  TIMESTAMP(3),
  "vistas"      INTEGER NOT NULL DEFAULT 0,
  "creadoPor"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccesoAlEstadoDeCuenta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AccesoAlEstadoDeCuenta_cuentaId_key" ON "AccesoAlEstadoDeCuenta" ("cuentaId");
CREATE UNIQUE INDEX IF NOT EXISTS "AccesoAlEstadoDeCuenta_accessToken_key" ON "AccesoAlEstadoDeCuenta" ("accessToken");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccesoAlEstadoDeCuenta_cuentaId_fkey') THEN
    ALTER TABLE "AccesoAlEstadoDeCuenta" ADD CONSTRAINT "AccesoAlEstadoDeCuenta_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaFinanciera"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "AccesoAlEstadoDeCuenta" ENABLE ROW LEVEL SECURITY;
