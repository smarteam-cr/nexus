-- 2026-08-17 · El libro de egresos mensual y el tipo de cambio de presentación.
--
-- Por qué: Elías pidió que el módulo de finanzas pueble solo el reporte anual de
-- equilibrio que hoy vive fuera del sistema (dev.smarteamcr.com/finanzas/, un HTML
-- estático con los números incrustados a mano). Ese reporte necesita saber cuánto
-- costó CADA MES del año, y Nexus solo sabe cuánto cuesta la operación HOY:
-- `CostoRecurrente` guarda el monto vigente y `updateCosto` estampa
-- `fechaEfectiva = hoy` en cada cambio, así que un burn dibujado hacia marzo mostraría
-- el costo de agosto — una línea plana, creíble y falsa (ya diagnosticado en DECISIONS
-- §Planillas, historial y la cadencia de cada aliado).
--
-- El dato no es nuevo: el Excel de egresos YA trae la variación mes a mes de
-- herramientas y costos fijos, y el importador la leía y la descartaba (colapsaba cada
-- concepto a su moda; los de monto variable ni se cargaban). `EgresoMensual` lo
-- persiste. La planilla —que es ~78% del costo— NO entra acá: ya tiene su serie real en
-- `PagoPlanilla`.
--
-- ADITIVO: 2 tablas nuevas + 2 enums nuevos. Nada se dropea, nada se renombra, ninguna
-- columna existente cambia. El código viejo no toca ninguna de las dos, así que la
-- ventana de deploy es inocua en las dos direcciones.
--
-- ⚠ RLS, decidido por tabla y NO por default:
--   · `EgresoMensual` SÍ lleva deny-all RESTRICTIVE (se agrega en prisma/policies.sql,
--     que es la fuente restaurable): lleva la estructura de costos de la empresa y el
--     cargo de las tarjetas — mismo peso que `TarjetaCredito` y `CostoMovimiento`.
--   · `TipoCambioMes` NO lleva deny-all, a propósito: una tasa de cambio publicada no es
--     información sensible. Mismo criterio que `PartnerComercial`. RLS habilitado igual,
--     que es lo que tapa al `anon` de Supabase.
--
-- Aplicación:
--   1. git pull  (esta base la comparten 2 PCs)
--   2. npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
--      → debe salir vacío salvo el ruido conocido (embedding pgvector, CHECK de logoScale)
--   3. ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-08-17-reporte-equilibrio.sql
--   4. npx prisma generate     (NUNCA db push: dropea lo que el schema no declara)
--   5. ALLOW_PROD_WRITE=1 npm run db:policies    (aplica el deny-all de EgresoMensual)
--   6. reiniciar el dev server
--   7. npm run check:invariants  (INV4/INV7 prueban que el DDL aterrizó)

-- ── Enums ───────────────────────────────────────────────────────────────────────
-- Los cinco valores de EgresoCategoria nacen juntos aunque hoy solo se escriban tres:
-- un ALTER TYPE ADD VALUE posterior no corre dentro de una transacción y obliga a
-- coordinar las 2 PCs. Crearlos ahora es gratis; agregarlos después, no.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EgresoCategoria') THEN
        CREATE TYPE "EgresoCategoria" AS ENUM (
            'PLANILLA', 'HERRAMIENTA', 'FIJO_OPERACION', 'TARJETA', 'RESERVA_AGUINALDO'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EgresoOrigen') THEN
        CREATE TYPE "EgresoOrigen" AS ENUM ('EXCEL_EGRESOS', 'MANUAL');
    END IF;
END $$;

-- ── EgresoMensual ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "EgresoMensual" (
    "id"             TEXT              NOT NULL,
    -- "YYYY-MM". Mismo vocabulario que Cobro.periodo y PagoPlanilla.periodo: el reporte
    -- trae los 12 meses con un solo `IN` y reusa los helpers de periodo que ya existen.
    "periodo"        TEXT              NOT NULL,
    "categoria"      "EgresoCategoria" NOT NULL,
    -- El nombre legible; `conceptoClave` es la versión normalizada que se compara. Sin
    -- ese par, una tilde distinta parte la serie del mismo concepto en dos.
    "concepto"       TEXT              NOT NULL,
    "conceptoClave"  TEXT              NOT NULL,
    "monto"          DECIMAL(12,2)     NOT NULL,
    "moneda"         "CobranzaMoneda"  NOT NULL,
    -- La hoja no siempre dice la moneda: a veces se infiere del formato de la celda. El
    -- decodificador ya lo calculaba y se descartaba; ahora alimenta el aviso de calidad.
    "monedaInferida" BOOLEAN           NOT NULL DEFAULT false,
    "origen"         "EgresoOrigen"    NOT NULL DEFAULT 'EXCEL_EGRESOS',
    -- Nullable: el Excel nombra conceptos ya dados de baja o que nunca se cargaron como
    -- costo vigente. SetNull — borrar el costo no borra lo que ya se gastó.
    "costoId"        TEXT,
    -- De qué celda salió, para auditar la fila sin reabrir el archivo.
    "fuente"         TEXT,
    -- Por qué el importador no lo carga como costo recurrente (monto variable, etc.).
    "notas"          TEXT,
    "registradoPor"  TEXT              NOT NULL,
    "registradoEn"   TIMESTAMP(3)      NOT NULL,
    "createdAt"      TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)      NOT NULL,
    CONSTRAINT "EgresoMensual_pkey" PRIMARY KEY ("id")
);

-- Idempotencia del sembrado: re-correr el importador ACTUALIZA, nunca duplica.
CREATE UNIQUE INDEX IF NOT EXISTS "EgresoMensual_periodo_categoria_conceptoClave_key"
    ON "EgresoMensual" ("periodo", "categoria", "conceptoClave");
CREATE INDEX IF NOT EXISTS "EgresoMensual_periodo_idx"    ON "EgresoMensual" ("periodo");
CREATE INDEX IF NOT EXISTS "EgresoMensual_costoId_idx"    ON "EgresoMensual" ("costoId");

-- ⛔ EL CHECK QUE EVITA CONTAR LA PLANILLA DOS VECES.
-- La planilla vive en `PagoPlanilla` (periodo × quincena × persona, con el salario real
-- de cada mes) y la reserva de aguinaldo se DERIVA de ese mismo libro. Si además se
-- escribieran acá, el promedio del punto de equilibrio las sumaría dos veces y el piso
-- mensual saldría ~78% más alto. El enum los tiene para que el vocabulario del reporte
-- esté completo; la base impide que se persistan.
ALTER TABLE "EgresoMensual" DROP CONSTRAINT IF EXISTS "EgresoMensual_solo_categorias_medidas";
ALTER TABLE "EgresoMensual"
    ADD CONSTRAINT "EgresoMensual_solo_categorias_medidas"
    CHECK ("categoria" NOT IN ('PLANILLA', 'RESERVA_AGUINALDO'));

-- Un egreso negativo sería una nota de crédito, que es otro hecho y necesitaría otro
-- modelo. Hoy no existe: mejor que la carga falle a que el promedio del año baje solo.
ALTER TABLE "EgresoMensual" DROP CONSTRAINT IF EXISTS "EgresoMensual_monto_no_negativo";
ALTER TABLE "EgresoMensual"
    ADD CONSTRAINT "EgresoMensual_monto_no_negativo" CHECK ("monto" >= 0);

-- El formato del periodo es la clave de agrupación de todo el reporte: un "2026-13" o un
-- "2026-1" desalinearía un mes entero sin que nada avise.
ALTER TABLE "EgresoMensual" DROP CONSTRAINT IF EXISTS "EgresoMensual_periodo_formato";
ALTER TABLE "EgresoMensual"
    ADD CONSTRAINT "EgresoMensual_periodo_formato"
    CHECK ("periodo" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EgresoMensual_costoId_fkey') THEN
        ALTER TABLE "EgresoMensual"
            ADD CONSTRAINT "EgresoMensual_costoId_fkey"
            FOREIGN KEY ("costoId") REFERENCES "CostoRecurrente" ("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

ALTER TABLE "EgresoMensual" ENABLE ROW LEVEL SECURITY;

-- ── TipoCambioMes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "TipoCambioMes" (
    "id"            TEXT          NOT NULL,
    "periodo"       TEXT          NOT NULL,
    -- Colones por UN dólar. DECIMAL(12,4) y no (12,2) como el dinero: una tasa no es un
    -- monto, y truncarla a centavos mete error sistemático en cada conversión del año.
    "crcPorUsd"     DECIMAL(12,4) NOT NULL,
    -- Obligatoria: "BCCR venta, promedio del mes", "el 500 con que se arma la hoja". Un
    -- número sin procedencia no se puede auditar ni discutir.
    "fuente"        TEXT          NOT NULL,
    "registradoPor" TEXT          NOT NULL,
    "registradoEn"  TIMESTAMP(3)  NOT NULL,
    "notas"         TEXT,
    "createdAt"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "TipoCambioMes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TipoCambioMes_periodo_key" ON "TipoCambioMes" ("periodo");

-- Techo de cordura, no una opinión sobre el colón: por debajo de 50 o por encima de 5000
-- el número está mal tecleado (un 5.13 en vez de 513 convierte medio millón de dólares en
-- cien, y el reporte se lee entero sin que nada chille).
ALTER TABLE "TipoCambioMes" DROP CONSTRAINT IF EXISTS "TipoCambioMes_tasa_rango";
ALTER TABLE "TipoCambioMes"
    ADD CONSTRAINT "TipoCambioMes_tasa_rango"
    CHECK ("crcPorUsd" > 50 AND "crcPorUsd" < 5000);

ALTER TABLE "TipoCambioMes" DROP CONSTRAINT IF EXISTS "TipoCambioMes_periodo_formato";
ALTER TABLE "TipoCambioMes"
    ADD CONSTRAINT "TipoCambioMes_periodo_formato"
    CHECK ("periodo" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

ALTER TABLE "TipoCambioMes" ENABLE ROW LEVEL SECURITY;

-- ⚠ Prisma NO modela un default en `updatedAt` (lo escribe el cliente), así que dejarlo
-- con DEFAULT CURRENT_TIMESTAMP le mete una línea de drift permanente al detector.
ALTER TABLE "EgresoMensual" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "TipoCambioMes" ALTER COLUMN "updatedAt" DROP DEFAULT;
