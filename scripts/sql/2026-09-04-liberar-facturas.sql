-- 2026-09-04 · Liberar una factura deja evidencia y una línea de trabajo hacia el ERP
--
-- ADITIVA E INOCUA. Un enum nuevo y una tabla nueva; el código viejo que corre en el VPS no
-- los conoce y no se entera. NO agrega valores a ningún enum existente — a propósito, porque
-- `ALTER TYPE ... ADD VALUE` no corre en transacción y necesita el one-liner aparte.
--
-- ── POR QUÉ ────────────────────────────────────────────────────────────────────────
-- Cuando cambia el acuerdo de pago, hay cobros ya facturados que el acuerdo nuevo contradice.
-- Para poder regenerar hace falta «liberarlos»: quitarles la marca de factura y devolverlos a
-- PROGRAMADO. Pero eso deja un documento emitido en el ERP que alguien tiene que anular, y
-- **Nexus nunca escribe en el ERP** — así que la única forma de que ese trabajo no se pierda
-- es dejarlo anotado de este lado.
--
-- ⚠ Y hay una segunda razón, más grave: hoy revertir una factura **destruye la autoría**.
-- `cambiarEstadoCobro` pone `facturadoPor` y `facturadoEn` en null, y el único rastro que
-- queda es `updatedAt` — sin autor y sin el valor anterior. Si dos personas discuten si una
-- factura se emitió, no hay dato en Nexus que lo conteste. Esta tabla archiva en vez de borrar.
--
-- ── POR QUÉ `cobroId` NO ES LLAVE FORÁNEA ──────────────────────────────────────────
-- El cobro se BORRA al regenerar (es lo que pasa con el #3 de Wherex). Un `ON DELETE CASCADE`
-- se llevaría el rastro de la factura que hay que anular, que es justamente lo que no puede
-- perderse; y un `SET NULL` dejaría la fila sin poder señalar de qué cobro venía. Por eso el
-- id se guarda suelto y **la fila lleva un snapshot completo**: se tiene que poder leer sola,
-- sin el cobro, sin el servicio y meses después.
--
-- ── APLICACIÓN ─────────────────────────────────────────────────────────────────────
--   1. git pull                                     (la base la comparten 2 PCs)
--   2. ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-04-liberar-facturas.sql
--   3. npx prisma generate                          (NUNCA db push)
--   4. ALLOW_PROD_WRITE=1 npm run db:policies       (RLS + la policy explícita)
--   5. reiniciar el dev server                      (el cliente viejo no entra por HMR)
--
-- ⚠ El SQL va a producción ANTES que el código que lo usa.

-- ── 1. Qué se decidió hacer con la factura ─────────────────────────────────────────
-- CANCELAR = el documento se anula/elimina en el ERP.
-- REVERTIR = se emite una nota de crédito que lo reversa; los dos documentos quedan.
-- La persona elige una por factura, sin default: depende de si ya salió al cliente.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CobranzaDecisionFactura') THEN
    CREATE TYPE "CobranzaDecisionFactura" AS ENUM ('CANCELAR', 'REVERTIR');
  END IF;
END $$;

-- ── 2. La evidencia y la cola de trabajo, en una sola tabla ────────────────────────
CREATE TABLE IF NOT EXISTS "FacturaLiberada" (
  "id"                TEXT PRIMARY KEY,

  -- La única FK real. Si se borra el cliente, esta fila no significa nada.
  "cuentaId"          TEXT NOT NULL,

  -- Sueltos a propósito (ver cabecera): el cobro puede desaparecer y la fila tiene que sobrevivir.
  "servicioId"        TEXT,
  "cobroId"           TEXT,

  -- ── El snapshot. La fila se lee sola, sin el cobro y sin el servicio. ────────────
  "clienteNombre"     TEXT NOT NULL,
  "numCuota"          INTEGER,
  "periodo"           TEXT NOT NULL,
  "monto"             DECIMAL(12,2) NOT NULL,
  "moneda"            "CobranzaMoneda" NOT NULL,
  "fechaEmision"      DATE,
  "referenciaExterna" TEXT,
  -- ⚠ Quién había facturado. Es el dato que el revert de hoy destruye.
  "facturadoPor"      TEXT,

  -- ── La decisión ──────────────────────────────────────────────────────────────────
  -- En qué sistema vive el documento. Se CONFIRMA al liberar y no se hereda en silencio:
  -- `CuentaFinanciera.viaCobro` tiene ODOO por defecto y 16 cuentas internacionales lo
  -- arrastran sin que nadie lo haya elegido.
  "plataforma"        "CobranzaViaCobro" NOT NULL,
  "decision"          "CobranzaDecisionFactura" NOT NULL,
  "motivo"            TEXT,

  -- ── Quién y cuándo ───────────────────────────────────────────────────────────────
  "liberadaPor"       TEXT NOT NULL,
  "liberadaEn"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Cierre. ODOO se cierra solo cuando el sync ve el documento anulado; MERCURY y OTRA no
  -- tienen espejo, así que las cierra una persona.
  "resueltaEn"        TIMESTAMP(3),
  "resueltaPor"       TEXT,

  CONSTRAINT "FacturaLiberada_cuentaId_fkey"
    FOREIGN KEY ("cuentaId") REFERENCES "CuentaFinanciera"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Lo pendiente es lo que se consulta siempre; lo resuelto casi nunca.
CREATE INDEX IF NOT EXISTS "FacturaLiberada_resueltaEn_idx" ON "FacturaLiberada"("resueltaEn");
CREATE INDEX IF NOT EXISTS "FacturaLiberada_cuentaId_idx"   ON "FacturaLiberada"("cuentaId");
CREATE INDEX IF NOT EXISTS "FacturaLiberada_cobroId_idx"    ON "FacturaLiberada"("cobroId");

-- ── 3. RLS ─────────────────────────────────────────────────────────────────────────
-- Ningún DDL la habilita solo, y Supabase auto-otorga SELECT a `anon` sobre todo `public`.
-- Son montos y nombres de clientes.
ALTER TABLE "FacturaLiberada" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "FacturaLiberada";
CREATE POLICY deny_all_non_superuser ON "FacturaLiberada"
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (false);
