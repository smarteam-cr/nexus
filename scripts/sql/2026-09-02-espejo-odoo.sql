-- 2026-09-02 · Espejo de facturación de Odoo (etapa 1 del plan de integración)
--
-- Nexus va a LEER de Odoo y guardar un espejo de solo lectura de lo facturado y lo cobrado,
-- para ponerlo al lado de su propio plan de cobros. Odoo es dueño de los HECHOS (factura
-- emitida, pago recibido, IVA); Nexus sigue siendo dueño de la INTENCIÓN (qué debería
-- facturarse y cuándo, que es el `Cobro` con su `fechaProgramada`). El espejo completa el
-- modelo, no lo reemplaza. Ver docs/odoo-integracion-plan.md.
--
-- Molde: `VentaGanada` — identidad por id externo con @unique de UNA columna (no el par
-- fuente/fuenteIdExterno, que ya está ocupado con "sheet" en 45 de 49 cuentas y es un solo
-- par), nunca borra sino que marca, y bitácora de cambios aparte.
--
-- ADITIVA e inocua: 6 tablas nuevas + 3 enums nuevos. Nada se dropea ni se renombra, y el
-- código que hoy corre en el VPS no lee ninguna de estas tablas.
--
-- Aplicación:
--   1. git pull  (esta base la comparten 2 PCs)
--   2. npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
--      → verificado el 2026-09-02: solo el ruido conocido (KnowledgeEmbedding.embedding de
--        pgvector y 4 DropIndex de Project/ProjectCanvas), que NO se aplica.
--   3. ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-02-espejo-odoo.sql
--   4. Los ALTER TYPE van APARTE (ver el pie de este archivo): no corren en transacción.
--   5. npx prisma generate     (NUNCA db push)
--   6. ALLOW_PROD_WRITE=1 npm run db:policies
--   7. reiniciar el dev server (el Prisma client viejo no entra por HMR)
--   8. npm run check:invariants

-- ── Enums ───────────────────────────────────────────────────────────────────────
-- Con todos sus valores desde el día 1: un ALTER TYPE ADD VALUE no corre en transacción y
-- obliga a coordinar las 2 PCs.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FacturaOdooEstadoEspejo') THEN
        CREATE TYPE "FacturaOdooEstadoEspejo" AS ENUM (
            'VIGENTE',      -- vuelve del sync, normal
            'DESAPARECIDA'  -- ya no vuelve de Odoo. NUNCA se borra la fila.
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FacturaOdooCambioTipo') THEN
        CREATE TYPE "FacturaOdooCambioTipo" AS ENUM (
            'ALTA',
            'MONTO',
            'RESIDUAL',
            'ESTADO_PAGO',   -- payment_state
            'ESTADO',        -- state (draft/posted/cancel)
            'FECHA',
            'CUENTA',        -- se resolvió o cambió a qué CuentaFinanciera pertenece
            'DESAPARECIDA'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OdooVinculoVia') THEN
        CREATE TYPE "OdooVinculoVia" AS ENUM (
            'CEDULA',  -- por vat — la única señal sin falsos positivos
            'MONTO',   -- por monto exacto de factura — la más productiva (17 vs 6 del nombre)
            'NOMBRE',  -- la más débil acá: Odoo guarda razón social y Nexus nombre comercial
            'MANUAL'   -- lo resolvió una persona buscando
        );
    END IF;
END $$;

-- ── FacturaOdoo ─────────────────────────────────────────────────────────────────
-- ⚠ `montoNeto` (amount_untaxed) es el que se compara contra Cobro.monto. Los cobros de Nexus
-- se importaron SIN IVA (medido: 12 de 13 clientes coinciden con la columna de quincena de la
-- hoja y no con quincena × 1,13). Comparar contra `montoTotal` marcaría las 304 facturas como
-- descuadradas por exactamente 13 %.
--
-- ⚠ Todos los montos en moneda NATIVA del documento. Acá NO se convierte nada: `convertir()`
-- de lib/finanzas/equilibrio.ts sigue siendo el único punto de conversión del sistema, y hay
-- un test estructural (§K de equilibrio.test.ts) que lo vigila.

CREATE TABLE IF NOT EXISTS "FacturaOdoo" (
    "id"                TEXT NOT NULL,
    "odooMoveId"        INTEGER NOT NULL,
    "numero"            TEXT NOT NULL,
    "moveType"          TEXT NOT NULL,
    "state"             TEXT NOT NULL,
    "paymentState"      TEXT NOT NULL,
    "invoiceDate"       DATE NOT NULL,
    -- Se guarda para poder AUDITAR la diferencia, pero el vencimiento se calcula con
    -- invoice_date + CuentaFinanciera.creditoDias: el de cabecera es el MÁXIMO de los
    -- vencimientos, y los 90 días de Colby no están configurados en ninguno de los dos lados.
    "invoiceDateDue"    DATE,
    "montoNeto"         DECIMAL(14,2) NOT NULL,
    "montoTotal"        DECIMAL(14,2) NOT NULL,
    "montoResidual"     DECIMAL(14,2) NOT NULL,
    "montoImpuesto"     DECIMAL(14,2) NOT NULL,
    -- Con signo: amount_total es POSITIVO también en las notas de crédito, así que sumar
    -- facturas y notas con `montoTotal` sobreestima la venta y nada avisa.
    "montoTotalSigned"  DECIMAL(14,2) NOT NULL,
    "moneda"            TEXT NOT NULL,
    "odooPartnerId"     INTEGER NOT NULL,
    "odooPartnerNombre" TEXT NOT NULL,
    "cuentaId"          TEXT,
    "estadoEspejo"      "FacturaOdooEstadoEspejo" NOT NULL DEFAULT 'VIGENTE',
    "sincronizadoEn"    TIMESTAMP(3) NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FacturaOdoo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FacturaOdoo_odooMoveId_key" ON "FacturaOdoo"("odooMoveId");
CREATE INDEX IF NOT EXISTS "FacturaOdoo_cuentaId_idx" ON "FacturaOdoo"("cuentaId");
CREATE INDEX IF NOT EXISTS "FacturaOdoo_invoiceDate_idx" ON "FacturaOdoo"("invoiceDate");
CREATE INDEX IF NOT EXISTS "FacturaOdoo_paymentState_invoiceDate_idx" ON "FacturaOdoo"("paymentState", "invoiceDate");

-- ── FacturaOdooCambio ───────────────────────────────────────────────────────────
-- Historia APPEND-ONLY (patrón VentaGanadaCambio / CostoMovimiento).
-- ⚠ `registradoPor` NO está en el molde: la bitácora de VentaGanada la escribe siempre el
-- sync, sin actor humano. Acá el emparejado lo edita una persona, y sin este campo no se
-- puede distinguir "lo movió Odoo" de "lo movió Alexander".

CREATE TABLE IF NOT EXISTS "FacturaOdooCambio" (
    "id"            TEXT NOT NULL,
    "facturaId"     TEXT,
    -- Snapshot autosuficiente: la fila se lee sola aunque la factura cambie o se borre.
    "odooMoveId"    INTEGER NOT NULL,
    "numero"        TEXT NOT NULL,
    "tipo"          "FacturaOdooCambioTipo" NOT NULL,
    "anterior"      TEXT,
    "nuevo"         TEXT,
    "registradoPor" TEXT,
    "detectadoEn"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FacturaOdooCambio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FacturaOdooCambio_facturaId_idx" ON "FacturaOdooCambio"("facturaId");
CREATE INDEX IF NOT EXISTS "FacturaOdooCambio_detectadoEn_idx" ON "FacturaOdooCambio"("detectadoEn");

-- ── CobroFacturaOdoo ────────────────────────────────────────────────────────────
-- N:M a propósito: una factura puede cubrir varias cuotas, y una nota de crédito no
-- corresponde a ninguna.

CREATE TABLE IF NOT EXISTS "CobroFacturaOdoo" (
    "id"           TEXT NOT NULL,
    "cobroId"      TEXT NOT NULL,
    "facturaId"    TEXT NOT NULL,
    -- false = lo propuso el sistema y nadie lo confirmó todavía.
    "confirmado"   BOOLEAN NOT NULL DEFAULT false,
    "vinculadoPor" TEXT,
    "vinculadoEn"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Cobro y factura en monedas distintas: se MARCA y se muestran las dos cifras. Cuadrarlas
    -- exigiría convertir, y este módulo no convierte.
    "monedaDispar" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "CobroFacturaOdoo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CobroFacturaOdoo_cobroId_facturaId_key" ON "CobroFacturaOdoo"("cobroId", "facturaId");
CREATE INDEX IF NOT EXISTS "CobroFacturaOdoo_facturaId_idx" ON "CobroFacturaOdoo"("facturaId");

-- ── OdooPartnerVinculo ──────────────────────────────────────────────────────────
-- N:1: varios res.partner de Odoo pueden apuntar a UNA CuentaFinanciera — un holding factura
-- con varios nombres, y hay 8 vat duplicados en Odoo que lo confirman. Por eso el UNIQUE va
-- del lado del partner, no de la cuenta.

CREATE TABLE IF NOT EXISTS "OdooPartnerVinculo" (
    "id"                TEXT NOT NULL,
    "odooPartnerId"     INTEGER NOT NULL,
    "odooPartnerNombre" TEXT NOT NULL,
    "odooVat"           TEXT,
    "cuentaId"          TEXT,
    "via"               "OdooVinculoVia",
    -- true = "este partner de Odoo no es cliente nuestro". Odoo tiene 82 clientes y Nexus 49
    -- cuentas: la diferencia es historia, no un hueco que haya que llenar.
    "ignorado"          BOOLEAN NOT NULL DEFAULT false,
    "confirmadoPor"     TEXT,
    "confirmadoEn"      TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OdooPartnerVinculo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OdooPartnerVinculo_odooPartnerId_key" ON "OdooPartnerVinculo"("odooPartnerId");
CREATE INDEX IF NOT EXISTS "OdooPartnerVinculo_cuentaId_idx" ON "OdooPartnerVinculo"("cuentaId");

-- ── SyncOdooCorrida ─────────────────────────────────────────────────────────────
-- ⚠ Existe porque `CronJobState` guarda ESTADO, no historia: una fila por job, el claim se
-- estampa ANTES de correr, y no hay campo de error. Con eso no se puede decir "viene fallando
-- hace tres días" — que es exactamente lo que hoy nadie puede saber cuando un job se rompe,
-- porque el error solo va al log del contenedor.

CREATE TABLE IF NOT EXISTS "SyncOdooCorrida" (
    "id"             TEXT NOT NULL,
    "iniciadaEn"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminadaEn"    TIMESTAMP(3),
    "ok"             BOOLEAN NOT NULL DEFAULT false,
    "parcial"        BOOLEAN NOT NULL DEFAULT false,
    "disparadaPor"   TEXT NOT NULL,
    "facturasVistas" INTEGER NOT NULL DEFAULT 0,
    "creadas"        INTEGER NOT NULL DEFAULT 0,
    "actualizadas"   INTEGER NOT NULL DEFAULT 0,
    "desaparecidas"  INTEGER NOT NULL DEFAULT 0,
    "vinculadas"     INTEGER NOT NULL DEFAULT 0,
    "error"          TEXT,
    "duracionMs"     INTEGER,
    CONSTRAINT "SyncOdooCorrida_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SyncOdooCorrida_iniciadaEn_idx" ON "SyncOdooCorrida"("iniciadaEn");
CREATE INDEX IF NOT EXISTS "SyncOdooCorrida_ok_iniciadaEn_idx" ON "SyncOdooCorrida"("ok", "iniciadaEn");

-- ── DiferenciaOdooAceptada ──────────────────────────────────────────────────────
-- La mesa de trabajo con el CFO necesita poder decir "esto está bien así". El molde
-- (InconsistenciasPanel) no guarda estado a propósito, y eso sirve cuando toda diferencia es
-- un error — acá NO lo es: Odoo tiene 82 clientes y Nexus 49 cuentas, hay notas de crédito que
-- no corrigen ningún cobro, y va a haber redondeos que alguien decida aceptar. Sin esto, esas
-- líneas vuelven en cada sesión y a la tercera nadie mira la lista.
--
-- ⚠ `huella` guarda los NÚMEROS aceptados. Se acepta ESA diferencia ($2.000 contra $2.260), no
-- "este par para siempre": si el monto cambia, la línea vuelve sola. Una aceptación no puede
-- convertirse en el lugar donde se esconde un problema nuevo.

CREATE TABLE IF NOT EXISTS "DiferenciaOdooAceptada" (
    "id"          TEXT NOT NULL,
    "clave"       TEXT NOT NULL,
    "motivo"      TEXT NOT NULL,
    "huella"      TEXT NOT NULL,
    "aceptadaPor" TEXT NOT NULL,
    "aceptadaEn"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiferenciaOdooAceptada_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DiferenciaOdooAceptada_clave_key" ON "DiferenciaOdooAceptada"("clave");

-- ── Claves foráneas ─────────────────────────────────────────────────────────────
-- SetNull donde la historia tiene que sobrevivir al borrado; Cascade donde la fila no tiene
-- sentido sin su padre.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FacturaOdoo_cuentaId_fkey') THEN
        ALTER TABLE "FacturaOdoo" ADD CONSTRAINT "FacturaOdoo_cuentaId_fkey"
            FOREIGN KEY ("cuentaId") REFERENCES "CuentaFinanciera"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FacturaOdooCambio_facturaId_fkey') THEN
        ALTER TABLE "FacturaOdooCambio" ADD CONSTRAINT "FacturaOdooCambio_facturaId_fkey"
            FOREIGN KEY ("facturaId") REFERENCES "FacturaOdoo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CobroFacturaOdoo_cobroId_fkey') THEN
        ALTER TABLE "CobroFacturaOdoo" ADD CONSTRAINT "CobroFacturaOdoo_cobroId_fkey"
            FOREIGN KEY ("cobroId") REFERENCES "Cobro"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CobroFacturaOdoo_facturaId_fkey') THEN
        ALTER TABLE "CobroFacturaOdoo" ADD CONSTRAINT "CobroFacturaOdoo_facturaId_fkey"
            FOREIGN KEY ("facturaId") REFERENCES "FacturaOdoo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OdooPartnerVinculo_cuentaId_fkey') THEN
        ALTER TABLE "OdooPartnerVinculo" ADD CONSTRAINT "OdooPartnerVinculo_cuentaId_fkey"
            FOREIGN KEY ("cuentaId") REFERENCES "CuentaFinanciera"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- ── Guardarraíl que Prisma no modela ────────────────────────────────────────────
-- Ningún monto de una factura espejada puede ser negativo: el signo vive en
-- `montoTotalSigned`, que sí puede serlo (las notas de crédito).

ALTER TABLE "FacturaOdoo" DROP CONSTRAINT IF EXISTS "FacturaOdoo_montos_no_negativos";
ALTER TABLE "FacturaOdoo" ADD CONSTRAINT "FacturaOdoo_montos_no_negativos"
    CHECK ("montoNeto" >= 0 AND "montoTotal" >= 0 AND "montoImpuesto" >= 0);

-- ⚠ Prisma NO modela un default en `updatedAt` (lo escribe el cliente): dejarlo con
-- DEFAULT CURRENT_TIMESTAMP le mete una línea de drift permanente al detector.
ALTER TABLE "FacturaOdoo" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "OdooPartnerVinculo" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- ── RLS ─────────────────────────────────────────────────────────────────────────
-- Ningún DDL habilita RLS solo. Las seis van tapadas: llevan montos facturados de clientes
-- reales. `prisma/policies.sql` es la red idempotente que las restituye.

ALTER TABLE "FacturaOdoo"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FacturaOdooCambio"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CobroFacturaOdoo"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OdooPartnerVinculo"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncOdooCorrida"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiferenciaOdooAceptada"  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "FacturaOdoo";
CREATE POLICY deny_all_non_superuser ON "FacturaOdoo" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "FacturaOdooCambio";
CREATE POLICY deny_all_non_superuser ON "FacturaOdooCambio" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "CobroFacturaOdoo";
CREATE POLICY deny_all_non_superuser ON "CobroFacturaOdoo" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "OdooPartnerVinculo";
CREATE POLICY deny_all_non_superuser ON "OdooPartnerVinculo" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "SyncOdooCorrida";
CREATE POLICY deny_all_non_superuser ON "SyncOdooCorrida" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
DROP POLICY IF EXISTS deny_all_non_superuser ON "DiferenciaOdooAceptada";
CREATE POLICY deny_all_non_superuser ON "DiferenciaOdooAceptada" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── ⚠ LOS ALTER TYPE VAN APARTE ─────────────────────────────────────────────────
-- No corren en transacción, así que `prisma db execute` no los acepta. Es la excepción
-- documentada en ARCHITECTURE.md Parte 0 · cap. D — one-liner con assertProdWriteAllowed():
--
--   ALTER TYPE "CobranzaOrigenCobro" ADD VALUE IF NOT EXISTS 'ODOO';
--   ALTER TYPE "CobranzaTipoAlerta"  ADD VALUE IF NOT EXISTS 'SYNC_ODOO_FALLIDO';
--   ALTER TYPE "CobranzaTipoAlerta"  ADD VALUE IF NOT EXISTS 'FACTURA_SIN_COBRO';
--
-- Agregar un valor que nadie usa todavía es inocuo para el código viejo del VPS.
