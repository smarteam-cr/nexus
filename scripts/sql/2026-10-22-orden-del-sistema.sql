-- 2026-10-22 · Lo que Nexus ordena solo en «Lo que no cuadra», con lo que había antes para deshacerlo.
--
-- POR QUÉ. Revisando Conciliación con Elías (2026-10-21): 35 de las 156 filas eran papeles que se ordenan
-- sin adivinar y sin mover plata (cuotas sin el número de su factura). Nexus las ordena solo con las reglas
-- de lib/cobranza/libro/ordenar.ts, y cada cambio queda acá: la cuota, el número que puso y lo que tenía
-- antes. «Deshacer» devuelve la cuota a como estaba y la marca, para que Nexus no la vuelva a ordenar.
-- Decisión completa: docs/DECISIONS.md › «Lo que no cuadra: lo que Nexus ordena solo».
--
-- QUÉ ENTRA. Un enum y una tabla nueva. `antes` y `despues` son la foto de los campos que se tocan
-- (número, su firma, fecha de emisión, monto, estado): no son relaciones, son la evidencia para deshacer.
--
-- ADITIVO y se puede correr dos veces. El código viejo no conoce la tabla.
-- ⚠ deny-all RESTRICTIVE, como las demás tablas de cobranza que no lee el cliente.
--
-- Aplicación:
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-10-22-orden-del-sistema.sql
--   npx prisma generate   ·   npm run check:invariants

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReglaDeOrden') THEN
    CREATE TYPE "ReglaDeOrden" AS ENUM ('NUMERO_DE_MERCURY', 'VARIAS_CUOTAS', 'FACTURA_REEMPLAZADA');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "OrdenDelSistema" (
  "id"          TEXT NOT NULL,
  "cobroId"     TEXT NOT NULL,
  "cuentaId"    TEXT NOT NULL,
  "grupo"       TEXT NOT NULL,
  "regla"       "ReglaDeOrden" NOT NULL,
  "fuente"      "CobranzaViaCobro" NOT NULL,
  "numero"      TEXT NOT NULL,
  "texto"       TEXT NOT NULL,
  "antes"       JSONB NOT NULL,
  "despues"     JSONB NOT NULL,
  "creadoEn"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deshechoEn"  TIMESTAMP(3),
  "deshechoPor" TEXT,
  CONSTRAINT "OrdenDelSistema_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrdenDelSistema_cobroId_fkey" FOREIGN KEY ("cobroId") REFERENCES "Cobro"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrdenDelSistema_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaFinanciera"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrdenDelSistema_deshecho_entero" CHECK (("deshechoEn" IS NULL) = ("deshechoPor" IS NULL))
);

CREATE INDEX IF NOT EXISTS "OrdenDelSistema_cobroId_idx" ON "OrdenDelSistema" ("cobroId");
CREATE INDEX IF NOT EXISTS "OrdenDelSistema_cuentaId_idx" ON "OrdenDelSistema" ("cuentaId");
CREATE INDEX IF NOT EXISTS "OrdenDelSistema_grupo_idx" ON "OrdenDelSistema" ("grupo");
CREATE INDEX IF NOT EXISTS "OrdenDelSistema_creadoEn_idx" ON "OrdenDelSistema" ("creadoEn");

ALTER TABLE "OrdenDelSistema" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "OrdenDelSistema";
CREATE POLICY deny_all_non_superuser ON "OrdenDelSistema" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
