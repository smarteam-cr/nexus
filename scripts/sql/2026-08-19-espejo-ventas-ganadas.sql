-- 2026-08-19 · El espejo de lo VENDIDO: los tratos ganados de HubSpot, en Nexus.
--
-- Por qué: el reporte anual sabe cuánto se FACTURÓ pero no cuánto se VENDIÓ, y sobre todo
-- no sabe CUÁNDO se vendió. Elías pidió comparar las dos curvas y poder descontar de lo
-- facturado la parte que viene de ventas de años anteriores. La fecha de venta no existe
-- hoy en ninguna parte de Nexus: `ServicioContratado.fechaInicioFacturacion` parecía
-- servir, pero el importador la escribe como "la fecha del primer cobro importado", y
-- como la planilla solo cubre 2026, los 55 servicios "arrancan" en 2026. El cero que daba
-- el descuento era falso.
--
-- HubSpot sí tiene el dato bueno: se verificó que `closedate` coincide EXACTO con la
-- primera transición a etapa ganada en los 49 tratos ganados de 2026, y que 0 de 121
-- fueron reabiertos. Esa fecha se puede traer y confiar en ella.
--
-- ADITIVO: 2 tablas nuevas + 2 enums. Nada se dropea, nada se renombra, ninguna columna
-- existente cambia. El código viejo no toca ninguna de las dos.
--
-- ⚠ POR QUÉ HAY UNA TABLA DE CAMBIOS, y por qué NO es la que uno esperaría: se midió el
-- riesgo en vez de imaginarlo. Reaperturas de tratos ganados: 0 de 121. Ediciones de
-- MONTO después de ganarse: 27 de 49 — DISTELSA pasó por 7 versiones ($7.600 → $3.600),
-- Teamnet de $6.400 a $15.000, RC Inmobiliaria de $12.300 a $4.890. El vendido del año es
-- un número vivo; sin bitácora se mueve solo y nadie sabe cuándo.
--
-- ⚠ RLS: `VentaGanada` y `VentaGanadaCambio` llevan deny-all RESTRICTIVE (se agrega en
-- prisma/policies.sql, que es la fuente restaurable). Son montos de venta: mismo peso que
-- EgresoMensual. `TipoCambioMes` no lo lleva porque una tasa publicada no es sensible;
-- una venta sí.
--
-- ⚠ MONEDA: se guarda la NATIVA del trato más el convertido que trae HubSpot, este último
-- SOLO como control. El reporte convierte con TipoCambioMes como todo el módulo. Las dos
-- cifras difieren (HubSpot usa ~455 colones por dólar, Nexus 500) y el reporte declara la
-- diferencia en vez de elegir una en silencio.
--
-- Aplicación:
--   1. git pull  (esta base la comparten 2 PCs)
--   2. npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
--      → vacío salvo el ruido conocido (embedding pgvector, CHECK de logoScale)
--   3. ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-08-19-espejo-ventas-ganadas.sql
--   4. npx prisma generate     (NUNCA db push)
--   5. ALLOW_PROD_WRITE=1 npm run db:policies
--   6. npm run check:invariants

-- ── Enums ───────────────────────────────────────────────────────────────────────
-- Todos los valores desde el día 1: un ALTER TYPE ADD VALUE no corre en transacción y
-- obliga a coordinar las 2 PCs. Crearlos ahora es gratis.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VentaGanadaEstado') THEN
        CREATE TYPE "VentaGanadaEstado" AS ENUM ('GANADA', 'REABIERTA', 'PERDIDA', 'DESAPARECIDA');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VentaGanadaCambioTipo') THEN
        CREATE TYPE "VentaGanadaCambioTipo" AS ENUM ('ALTA', 'MONTO', 'FECHA_CIERRE', 'ESTADO', 'CLIENTE');
    END IF;
END $$;

-- ── VentaGanada ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "VentaGanada" (
    "id"                     TEXT                NOT NULL,
    -- La identidad. Re-sincronizar ACTUALIZA, nunca duplica.
    "hubspotDealId"          TEXT                NOT NULL,
    "nombre"                 TEXT                NOT NULL,
    -- La fecha que no existía en Nexus.
    "fechaCierre"            DATE                NOT NULL,
    -- Cuándo entró a etapa ganada según el historial: la corroboración independiente.
    "ganadaEn"               TIMESTAMP(3),
    -- Monto en la moneda del trato (hay tratos en colones: uno de ₡3.060.416).
    "monto"                  DECIMAL(14,2)       NOT NULL,
    "moneda"                 TEXT                NOT NULL,
    -- Control, NO se suma: lo que HubSpot dice que vale en la moneda de la casa.
    "montoConvertidoHubspot" DECIMAL(14,2),
    -- Se guarda SIEMPRE, aunque hoy no se cuente. "HubSpot Shared Selling" es registro de
    -- oportunidad y no facturación propia; si mañana se decide contarlo, el dato ya está.
    "pipelineId"             TEXT                NOT NULL,
    "pipelineLabel"          TEXT,
    "etapaId"                TEXT                NOT NULL,
    "estado"                 "VentaGanadaEstado" NOT NULL DEFAULT 'GANADA',
    -- Nullable: 42 de 222 tratos ganados no resuelven a ningún cliente de Nexus.
    "clientId"               TEXT,
    -- "company" o "nombre". Resolver por NOMBRE es un hallazgo, no un éxito: significa
    -- que la venta cuelga de otra empresa que la que factura (la venta de Analisalab vive
    -- en "Grupo Inve"; la de Corrugando, en ACCCSA; el TEC tiene sub-escuelas).
    "clienteVia"             TEXT,
    "hubspotCompanyId"       TEXT,
    -- Sospechar no es excluir: la regex marca, una persona decide.
    "sospechaPrueba"         BOOLEAN             NOT NULL DEFAULT false,
    "excluida"               BOOLEAN             NOT NULL DEFAULT false,
    "excluidaMotivo"         TEXT,
    "sincronizadoEn"         TIMESTAMP(3)        NOT NULL,
    "createdAt"              TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"              TIMESTAMP(3)        NOT NULL,
    CONSTRAINT "VentaGanada_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VentaGanada_hubspotDealId_key" ON "VentaGanada" ("hubspotDealId");
CREATE INDEX IF NOT EXISTS "VentaGanada_fechaCierre_idx"          ON "VentaGanada" ("fechaCierre");
CREATE INDEX IF NOT EXISTS "VentaGanada_clientId_idx"             ON "VentaGanada" ("clientId");
CREATE INDEX IF NOT EXISTS "VentaGanada_estado_fechaCierre_idx"   ON "VentaGanada" ("estado", "fechaCierre");

-- Una venta con monto negativo sería una nota de crédito: otro hecho, otro modelo. Mejor
-- que la carga falle a que el vendido del año baje solo.
ALTER TABLE "VentaGanada" DROP CONSTRAINT IF EXISTS "VentaGanada_monto_no_negativo";
ALTER TABLE "VentaGanada" ADD CONSTRAINT "VentaGanada_monto_no_negativo" CHECK ("monto" >= 0);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VentaGanada_clientId_fkey') THEN
        ALTER TABLE "VentaGanada"
            ADD CONSTRAINT "VentaGanada_clientId_fkey"
            FOREIGN KEY ("clientId") REFERENCES "Client" ("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "VentaGanada" ENABLE ROW LEVEL SECURITY;

-- ── VentaGanadaCambio ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "VentaGanadaCambio" (
    "id"            TEXT                    NOT NULL,
    -- Nullable + SetNull: la historia sobrevive al borrado de la venta.
    "ventaId"       TEXT,
    -- Snapshot autosuficiente: la fila se lee sola aunque la venta cambie o desaparezca.
    "hubspotDealId" TEXT                    NOT NULL,
    "nombre"        TEXT                    NOT NULL,
    "tipo"          "VentaGanadaCambioTipo" NOT NULL,
    "anterior"      TEXT,
    "nuevo"         TEXT,
    "detectadoEn"   TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VentaGanadaCambio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VentaGanadaCambio_ventaId_idx"     ON "VentaGanadaCambio" ("ventaId");
CREATE INDEX IF NOT EXISTS "VentaGanadaCambio_detectadoEn_idx" ON "VentaGanadaCambio" ("detectadoEn");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VentaGanadaCambio_ventaId_fkey') THEN
        ALTER TABLE "VentaGanadaCambio"
            ADD CONSTRAINT "VentaGanadaCambio_ventaId_fkey"
            FOREIGN KEY ("ventaId") REFERENCES "VentaGanada" ("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "VentaGanadaCambio" ENABLE ROW LEVEL SECURITY;

-- ⚠ Prisma NO modela un default en `updatedAt` (lo escribe el cliente): dejarlo con
-- DEFAULT CURRENT_TIMESTAMP le mete una línea de drift permanente al detector.
ALTER TABLE "VentaGanada" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- ── Corrección del mismo día: el monto puede faltar ─────────────────────────────
-- Medido al correr el primer backfill: 13 de 80 tratos ganados de 2026 NO tienen monto
-- cargado en HubSpot, todos del pipeline de venta compartida. Guardarlos en cero diría
-- que la venta vale cero; rechazarlos los haría invisibles. La venta existe: lo que falta
-- es el número, y eso el sistema lo dice en vez de inventarlo.
ALTER TABLE "VentaGanada" ALTER COLUMN "monto" DROP NOT NULL;
