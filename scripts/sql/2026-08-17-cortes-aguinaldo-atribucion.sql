-- 2026-08-17 · Cortes de tarjeta, aguinaldo pagado y atribución de la venta
--
-- ADITIVO: 3 tablas nuevas + 1 columna nullable. No borra nada, no altera el tipo
-- de ninguna columna existente, no inserta nada, no crea enums. Inocuo mientras
-- PROD corra el código viejo.
--
-- UN SOLO ARCHIVO a propósito: las tres mejoras llegan juntas y partirlo serían
-- tres eventos de coordinación con la otra PC en vez de uno.
--
-- QUÉ HABILITA (los tres pedidos de Elías del 2026-08-17):
--   CorteTarjeta    "de cada tarjeta se debe hacer seguimiento del dinero, cuándo
--                    se debe pagar, cuánto hay en deuda" — el estado de cuenta
--                    como DATO OBSERVADO, transcrito una vez al mes.
--   AguinaldoPago   "tener el cálculo de cuánto se le debe pagar, la fecha de
--                    pago y si está pago o no".
--   AtribucionVenta "las comisiones para vendedores es un % de cada DEAL GANADO"
--                    — hoy la regla es por CLIENTE y Nexus no sabe en ninguna
--                    parte quién ganó cada venta.
--   ReglaComisionVendedor.servicioId  tercer eje de especificidad de la regla
--                    (servicio > cliente > general).
--
-- ⚠ POR QUÉ `AtribucionVenta` ES UNA TABLA Y NO UNA COLUMNA EN ServicioContratado:
-- el mismo motivo por el que el salario vive en `CostoRecurrente` y NO en
-- `TeamMember` (DECISIONS §Privacidad de salarios). Es el dato que decide una
-- REMUNERACIÓN y no se cuelga de la entidad que leen los loaders de cobranza,
-- que son superficie ADMIN. De paso evita DDL sobre una tabla caliente que
-- comparten 2 PCs + PROD, y deja la puerta abierta a repartir una venta entre
-- dos vendedores (se borra el unique y se suma una columna de reparto) sin
-- rearquitecturar nada.
--
-- ⚠ NADA de esto entra a `computeCajaNeta` / `proyectarCostos` / `proyectarGastos`
-- ni al burn. Es EJECUCIÓN (pasado), no configuración — mismo precedente literal
-- que `PagoPlanilla`. `loadCajaNeta` ya proyecta los costos recurrentes mes a mes:
-- sumar además el corte de la tarjeta cobraría HubSpot dos veces.
--
-- ⚠ Las tarjetas NO derraman semáforo ni alertas (prohibición transversal). Acá
-- no hay ninguna columna de estado ni de urgencia: `pagadoEl` es un hecho, no un
-- color.
--
-- ⚠ RLS: cada tabla lleva su ENABLE explícito acá (ningún DDL lo hace solo). Las
-- policies deny-all RESTRICTIVE viven en prisma/policies.sql (idempotente) y hay
-- que correrlo DESPUÉS — las tres llevan plata de remuneración o de la empresa.
--
-- CÓMO SE APLICA (revisar antes de correr; SIEMPRE contra :5432, NUNCA :6543):
--   1. git pull                       (que el schema local incluya lo de la otra PC)
--   2. npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
--      → detector de drift ajeno. Ruido ESPERADO: la columna pgvector `embedding`
--        y el CHECK `Client_logoScale_rango`, que Prisma no modela.
--   3. ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts_sql_2026-08-17-cortes-aguinaldo-atribucion.sql
--   4. npx prisma generate            (NUNCA `db push`: dropea lo que el schema no declara)
--   5. ALLOW_PROD_WRITE=1 npm run db:policies
--   6. reiniciar el dev server        (el client viejo no conoce las tablas)
--   7. npm run check:invariants       (INV4/INV7 vuelven a verde)
--   8. avisarle a la otra PC + pushear el schema (RUNBOOK, invariante #2 regla 3)

BEGIN;

-- ── CorteTarjeta ────────────────────────────────────────────────────────────────
-- El estado de cuenta del mes, transcrito por una persona. Cuatro números que
-- llegan por correo del banco.
--
-- Se eligió esto en vez de un registro transacción por transacción a propósito, y
-- el argumento es un dato: `TarjetaCredito` tiene HOY 0 filas, o sea que la
-- sección que ya pide UN número por mes tiene adopción cero. Una pantalla que
-- exige tipear 40 líneas mensuales se abandona en tres semanas y queda mintiendo
-- por vacío, que es peor que no tenerla.
--
-- `saldoAnterior` y `pagoMinimo` se COPIAN del estado de cuenta, JAMÁS se
-- calculan — misma doctrina que el aguinaldo: dato observado, no tasa.
CREATE TABLE IF NOT EXISTS "CorteTarjeta" (
    "id"              TEXT NOT NULL,
    "tarjetaId"       TEXT NOT NULL,
    "fechaCorte"      DATE NOT NULL,
    -- La fecha REAL que imprime el banco. La derivada de diaCorte/diaPago es solo
    -- el default del formulario y se rotula como estimación mientras esta fila no
    -- exista: dos enteros no pueden expresar un banco de float largo.
    "fechaLimitePago" DATE NOT NULL,
    -- Nada lo LEE en esta tanda: se captura ahora porque es lo único que haría
    -- algebraicamente honesta una conciliación futura
    -- (deuda_hoy = deuda_al_corte - pagos + cargos_posteriores), y volver a
    -- buscarlo después significa releer estados de cuenta que nadie guarda.
    "saldoAnterior"   DECIMAL(12,2),
    "deudaAlCorte"    DECIMAL(12,2) NOT NULL,
    "pagoMinimo"      DECIMAL(12,2),
    "pagadoEl"        DATE,
    "montoPagado"     DECIMAL(12,2),
    "registradoPor"   TEXT NOT NULL,
    "registradoEn"    TIMESTAMP(3) NOT NULL,
    "notas"           TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CorteTarjeta_pkey" PRIMARY KEY ("id"),
    -- ⚠ SIN columna `moneda`: la tarjeta ya la declara y duplicarla violaría la
    -- regla §2.1 (prohibido duplicar lo derivable). Una tarjeta no cambia de
    -- moneda entre cortes.
    CONSTRAINT "CorteTarjeta_deuda_no_negativa"
      CHECK ("deudaAlCorte" >= 0),
    CONSTRAINT "CorteTarjeta_minimo_no_negativo"
      CHECK ("pagoMinimo" IS NULL OR "pagoMinimo" >= 0),
    CONSTRAINT "CorteTarjeta_anterior_no_negativo"
      CHECK ("saldoAnterior" IS NULL OR "saldoAnterior" >= 0),
    CONSTRAINT "CorteTarjeta_pagado_no_negativo"
      CHECK ("montoPagado" IS NULL OR "montoPagado" >= 0),
    -- El vencimiento no puede caer antes del corte.
    CONSTRAINT "CorteTarjeta_limite_no_antes_del_corte"
      CHECK ("fechaLimitePago" >= "fechaCorte"),
    -- La fecha del pago y su monto van JUNTOS o ninguno, igual que
    -- saldoUsado/saldoAlDia: media verdad sobre plata que salió es peor que nada.
    CONSTRAINT "CorteTarjeta_pago_completo"
      CHECK (("pagadoEl" IS NULL) = ("montoPagado" IS NULL))
);

-- Una tarjeta tiene UN corte por fecha. Sin esto, cargar dos veces el mismo
-- estado de cuenta duplica la deuda del mes en el historial.
CREATE UNIQUE INDEX IF NOT EXISTS "CorteTarjeta_tarjetaId_fechaCorte_key"
  ON "CorteTarjeta" ("tarjetaId", "fechaCorte");
-- El camino caliente: los cortes de una tarjeta, del más nuevo al más viejo.
CREATE INDEX IF NOT EXISTS "CorteTarjeta_tarjetaId_fechaCorte_idx"
  ON "CorteTarjeta" ("tarjetaId", "fechaCorte" DESC);
-- "Qué está por vencer y sin pagar", que es la pregunta #1 de la pantalla.
CREATE INDEX IF NOT EXISTS "CorteTarjeta_pagadoEl_fechaLimitePago_idx"
  ON "CorteTarjeta" ("pagadoEl", "fechaLimitePago");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CorteTarjeta_tarjetaId_fkey'
  ) THEN
    -- CASCADE: un corte no significa nada sin su tarjeta. Aun así la mutación
    -- frena con 409 el borrado de una tarjeta CON cortes y empuja a desactivarla
    -- — el cascade se llevaría plata escrita a mano y no hay deshacer.
    ALTER TABLE "CorteTarjeta"
      ADD CONSTRAINT "CorteTarjeta_tarjetaId_fkey"
      FOREIGN KEY ("tarjetaId") REFERENCES "TarjetaCredito"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "CorteTarjeta" ENABLE ROW LEVEL SECURITY;

-- ── AguinaldoPago ───────────────────────────────────────────────────────────────
-- Que el aguinaldo se pueda marcar PAGADO, con su fecha real y quién lo confirmó.
--
-- ⚠ POR QUÉ TABLA PROPIA Y NO UNA FILA MÁS DEL LIBRO DE PLANILLA — el riesgo es
-- real, no hipotético: `calcularAguinaldo` suma TODA fila PAGADO cuyo `periodo`
-- caiga en la ventana, sin mirar concepto. Una fila con periodo "2026-12" cae
-- dentro de la ventana del aguinaldo 2027 y lo inflaría en silencio. Además
-- colisionaría con el `@@unique(sujetoTeamMemberId, periodo, quincena)` contra la
-- quincena del 15 de diciembre, y el CHECK `quincena IN (1,2)` hace imposible
-- inventar una "quincena 3".
--
-- ⚠ SIN columna de estado: la fila EXISTE = está pagado. Un valor PENDIENTE sería
-- indistinguible de la ausencia de fila e invitaría a materializar filas vacías
-- por persona cada año.
--
-- ⚠ El monto se congela como SNAPSHOT (precedente doble y explícito:
-- `PagoPlanilla.monto` y `ComisionVendedor`). Corregir una quincena vieja después
-- no puede moverle el monto a un aguinaldo que ya salió del banco.
CREATE TABLE IF NOT EXISTS "AguinaldoPago" (
    "id"                 TEXT NOT NULL,
    -- El año del aguinaldo (la ventana es dic del anterior → nov de éste).
    "anio"               INTEGER NOT NULL,
    -- nullable porque TeamMember puede borrarse; `sujetoNombre` es el snapshot que
    -- sobrevive, igual que en PagoPlanilla.
    "sujetoTeamMemberId" TEXT,
    "sujetoNombre"       TEXT NOT NULL,
    "moneda"             TEXT NOT NULL,
    "monto"              DECIMAL(12,2) NOT NULL,
    -- Lo que se sumó y sobre cuántas quincenas: con esto la fila se puede auditar
    -- sola dentro de un año, sin recalcular contra un libro que ya cambió.
    "baseSumada"         DECIMAL(12,2) NOT NULL,
    "quincenasContadas"  INTEGER NOT NULL,
    -- Nexus NO elige entre la línea de solo salario y la que incluye comisiones,
    -- pero SÍ registra cuál eligió la persona.
    "incluyeComisiones"  BOOLEAN NOT NULL DEFAULT false,
    -- La fecha REAL en que salió la plata. La fecha objetivo (15 de diciembre) es
    -- una constante de código rotulada como objetivo, nunca como obligación
    -- legal: acá no hay lógica fiscal.
    "pagadoEl"           DATE NOT NULL,
    "confirmadoPor"      TEXT NOT NULL,
    "confirmadoEn"       TIMESTAMP(3) NOT NULL,
    "notas"              TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AguinaldoPago_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AguinaldoPago_monto_positivo" CHECK ("monto" > 0),
    CONSTRAINT "AguinaldoPago_base_no_negativa" CHECK ("baseSumada" >= 0),
    CONSTRAINT "AguinaldoPago_quincenas_no_negativas" CHECK ("quincenasContadas" >= 0),
    CONSTRAINT "AguinaldoPago_anio_razonable" CHECK ("anio" BETWEEN 2020 AND 2100),
    CONSTRAINT "AguinaldoPago_moneda_conocida" CHECK ("moneda" IN ('CRC','USD'))
);

-- Un aguinaldo por persona, año y moneda. CRC y USD son dos pagos distintos y
-- nunca uno convertido — la misma regla que sostiene todo el módulo.
-- ⚠ Con `sujetoTeamMemberId` NULL este unique NO colisiona (los NULL no son
-- iguales entre sí en Postgres): ése es el hueco que cierra INV19, exigiendo que
-- toda fila tenga persona.
CREATE UNIQUE INDEX IF NOT EXISTS "AguinaldoPago_anio_sujeto_moneda_key"
  ON "AguinaldoPago" ("anio", "sujetoTeamMemberId", "moneda");
CREATE INDEX IF NOT EXISTS "AguinaldoPago_anio_idx"
  ON "AguinaldoPago" ("anio");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AguinaldoPago_sujetoTeamMemberId_fkey'
  ) THEN
    -- SetNull y no Cascade: que alguien salga del equipo no puede borrar el
    -- registro de que se le pagó. `sujetoNombre` queda como snapshot.
    ALTER TABLE "AguinaldoPago"
      ADD CONSTRAINT "AguinaldoPago_sujetoTeamMemberId_fkey"
      FOREIGN KEY ("sujetoTeamMemberId") REFERENCES "TeamMember"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "AguinaldoPago" ENABLE ROW LEVEL SECURITY;

-- ── AtribucionVenta ─────────────────────────────────────────────────────────────
-- QUIÉN GANÓ CADA VENTA. Es el dato que hoy no existe en ninguna parte de Nexus y
-- sin el cual "un % de cada deal ganado" no se puede calcular.
--
-- ⚠ NO se puede derivar, y se verificó: `Project.hubspotOwnerEmail` es el CSE que
-- ENTREGA, no quien vendió — `sync-projects.ts` prioriza la propiedad
-- `csl_encargado` sobre el owner estándar con ese comentario, y los 70 valores
-- reales son CSE/CSL/DEV, con cero vendedores. Además el camino
-- servicio→proyecto→deal está vacío: 1 de 55 servicios tiene proyecto. Se elige a
-- mano, que es lo correcto: a quién se le paga es una decisión, no una inferencia.
--
-- El DEAL es `ServicioContratado` y no `Project` ni `BusinessCase`: es lo único
-- que tiene monto vendido, una fila por venta y, sobre todo, es el padre
-- OBLIGATORIO de cada `Cobro` — o sea que la plata que entra ya sabe de qué venta
-- viene, con un join que hoy no cuesta nada.
CREATE TABLE IF NOT EXISTS "AtribucionVenta" (
    "id"           TEXT NOT NULL,
    "servicioId"   TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    -- ⚠ TRES estados, no dos. Elías: «el CEO es el director de ventas también, y
    -- a veces él no comisiona, por eso debe validarse por el usuario el histórico
    -- de deals». O sea que "nadie la revisó todavía" (no hay fila) y "la revisé y
    -- acá no se paga comisión" (fila con comisiona=false) son cosas DISTINTAS.
    -- Si fueran la misma, un deal decidido a conciencia se leería para siempre
    -- como trabajo pendiente de atribuir, y el aviso de "N sin asignar" nunca
    -- llegaría a cero.
    --
    -- El vendedor se guarda IGUAL cuando no comisiona: quién ganó la venta es un
    -- hecho, y que no cobre por ella es una decisión aparte.
    "comisiona"    BOOLEAN NOT NULL DEFAULT true,
    "asignadoPor"  TEXT NOT NULL,
    "asignadoEn"   TIMESTAMP(3) NOT NULL,
    "notas"        TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AtribucionVenta_pkey" PRIMARY KEY ("id")
);

-- UN vendedor por venta. El día que una venta se reparta entre dos, se borra este
-- unique y se suma una columna de reparto — con una columna en ServicioContratado
-- eso habría sido rearquitecturar.
-- Idempotente y separado del CREATE porque la tabla se creó minutos antes en
-- este mismo evento de coordinación (nada pusheado todavía): re-correr el
-- archivo entero es seguro y sigue siendo UN solo evento para la otra PC.
ALTER TABLE "AtribucionVenta"
  ADD COLUMN IF NOT EXISTS "comisiona" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS "AtribucionVenta_servicioId_key"
  ON "AtribucionVenta" ("servicioId");
CREATE INDEX IF NOT EXISTS "AtribucionVenta_teamMemberId_idx"
  ON "AtribucionVenta" ("teamMemberId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AtribucionVenta_servicioId_fkey'
  ) THEN
    ALTER TABLE "AtribucionVenta"
      ADD CONSTRAINT "AtribucionVenta_servicioId_fkey"
      FOREIGN KEY ("servicioId") REFERENCES "ServicioContratado"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AtribucionVenta_teamMemberId_fkey'
  ) THEN
    -- Cascade: si la persona se borra, la atribución deja de tener sentido. Lo
    -- ya LIQUIDADO no se toca — `ComisionVendedor` guarda su propio snapshot
    -- autosuficiente justamente para esto.
    ALTER TABLE "AtribucionVenta"
      ADD CONSTRAINT "AtribucionVenta_teamMemberId_fkey"
      FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "AtribucionVenta" ENABLE ROW LEVEL SECURITY;

-- ── ReglaComisionVendedor.servicioId ───────────────────────────────────────────
-- Tercer eje de especificidad: servicio > cliente > general. Con esto, "¿el % es
-- de la persona o de este deal?" se contesta en la interfaz y no en el DDL.
--
-- Se agrega AHORA porque es una columna nullable sobre una tabla de 0 filas: hoy
-- es gratis, y mañana es otro evento de coordinación entre las 2 PCs.
ALTER TABLE "ReglaComisionVendedor"
  ADD COLUMN IF NOT EXISTS "servicioId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ReglaComisionVendedor_servicioId_fkey'
  ) THEN
    -- Cascade igual que `clientId`: una regla para un servicio que ya no existe
    -- no tiene sobre qué aplicarse.
    ALTER TABLE "ReglaComisionVendedor"
      ADD CONSTRAINT "ReglaComisionVendedor_servicioId_fkey"
      FOREIGN KEY ("servicioId") REFERENCES "ServicioContratado"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ReglaComisionVendedor_servicioId_idx"
  ON "ReglaComisionVendedor" ("servicioId");

-- ── Normalización contra lo que Prisma espera ──────────────────────────────────
-- `updatedAt` lo maneja Prisma en la aplicación (@updatedAt), no la base. El
-- DEFAULT se puso arriba para que la tabla sea usable desde SQL crudo, pero hay
-- que sacarlo o `migrate diff` va a reportar drift para siempre — que es
-- exactamente el ruido que hace que un drift REAL pase desapercibido. Mismo paso
-- que la tanda de PartnerComercial.
ALTER TABLE "CorteTarjeta"    ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "AguinaldoPago"   ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "AtribucionVenta" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Y el nombre que Prisma le da al unique compuesto, para que tampoco aparezca.
ALTER INDEX IF EXISTS "AguinaldoPago_anio_sujeto_moneda_key"
  RENAME TO "AguinaldoPago_anio_sujetoTeamMemberId_moneda_key";

COMMIT;
