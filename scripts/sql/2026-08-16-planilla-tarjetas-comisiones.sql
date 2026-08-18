-- 2026-08-16 · Tarjetas de credito, libro de planilla y comisiones
--
-- ADITIVO: 1 enum + 6 tablas + sus indices y FKs. No borra nada, no altera
-- ninguna tabla existente, no inserta nada. Un solo archivo a proposito: son
-- seis tablas que llegan juntas, y partirlas serian cuatro eventos de
-- coordinacion con la otra PC en vez de uno.
--
-- QUE HABILITA (ver docs/DECISIONS.md, seccion "El libro de planilla"):
--   TarjetaCredito       tarjetas de la empresa y su capacidad disponible
--   TarjetaCreditoCosto  puente tarjeta <-> costo recurrente (referencia)
--   PagoPlanilla         el libro de lo que se PAGO, por quincena
--   ComisionPartner      lo que Smarteam GANA de un aliado (ingreso, ADMIN)
--   ReglaComisionVendedor  el % que le toca a cada vendedor
--   ComisionVendedor     la comision LIQUIDADA (snapshot autosuficiente)
--
-- ⚠ NUNCA se guarda el numero completo de una tarjeta. `ultimos4` es
-- exactamente eso: los ultimos cuatro digitos. El Excel de Alex trae un PAN
-- completo en una hoja oculta y no entra a la base bajo ningun concepto.
--
-- ⚠ RLS: cada tabla lleva su ENABLE explicito aca (ningun DDL lo hace solo).
-- Las policies RESTRICTIVE de las cinco tablas SUPER_ADMIN viven en
-- prisma/policies.sql, que es idempotente y se corre despues.
-- ComisionPartner NO lleva deny-all: es un INGRESO y su superficie es ADMIN,
-- igual que IngresoVariable.
--
-- ⚠ SE APLICA A MANO, NUNCA con `db push`: el `migrate diff` de hoy trae
-- ademas 4 DROP INDEX y un DROP COLUMN (la columna pgvector `embedding`) que
-- son deriva viva y objetos que Prisma no modela — un push los borraria.
--
-- Como aplicarlo (revisa antes de correr):
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts~sql~2026-08-16-planilla-tarjetas-comisiones.sql
-- Despues, EN ESTE ORDEN:
--   npx prisma generate               (NO `db push`)
--   ALLOW_PROD_WRITE=1 npm run db:policies
--   reiniciar el dev server           (el client viejo no conoce las tablas)

BEGIN;

-- ── Enum ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PagoPlanillaEstado') THEN
    CREATE TYPE "PagoPlanillaEstado" AS ENUM ('PENDIENTE', 'PAGADO');
  END IF;
END$$;

-- ── TarjetaCredito ──────────────────────────────────────────────────────────
-- Disponible = limite - saldoUsado. El saldo lo ESCRIBE una persona con su
-- fecha de corte y queda auditado (saldoAlDia / saldoPorEmail), igual que
-- confirmadoPor / confirmadoEn en un cobro. Lo que Nexus suma de los costos
-- asignados NO calcula el saldo: un saldo es acumulado y un cargo es mensual.
CREATE TABLE IF NOT EXISTS "TarjetaCredito" (
    "id"                  TEXT NOT NULL,
    "alias"               TEXT NOT NULL,
    "emisor"              TEXT,
    -- SOLO los ultimos cuatro digitos. Jamas el numero completo.
    "ultimos4"            TEXT,
    "moneda"              "CobranzaMoneda" NOT NULL,
    -- nullable porque una tarjeta puede cargarse antes de saber su limite.
    "limite"              DECIMAL(12,2),
    -- nullable porque una tarjeta de la empresa puede no tener titular persona.
    "titularTeamMemberId" TEXT,
    "diaCorte"            INTEGER,
    "diaPago"             INTEGER,
    -- El saldo y su fecha de corte van juntos: un saldo sin fecha no dice nada.
    "saldoUsado"          DECIMAL(12,2),
    "saldoAlDia"          DATE,
    "saldoPorEmail"       TEXT,
    "activa"              BOOLEAN NOT NULL DEFAULT true,
    "notas"               TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TarjetaCredito_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TarjetaCredito_activa_idx" ON "TarjetaCredito"("activa");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TarjetaCredito_titularTeamMemberId_fkey') THEN
    ALTER TABLE "TarjetaCredito"
      ADD CONSTRAINT "TarjetaCredito_titularTeamMemberId_fkey"
      FOREIGN KEY ("titularTeamMemberId") REFERENCES "TeamMember"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

ALTER TABLE "TarjetaCredito" ENABLE ROW LEVEL SECURITY;

-- ── TarjetaCreditoCosto ─────────────────────────────────────────────────────
-- Tabla PUENTE y no una columna en CostoRecurrente: una tarjeta SI vence
-- (corte, pago) y una columna arrastraria ese vencimiento al costo, que por
-- regla no vence. Ese vencimiento tampoco puede derramar semaforo ni alertas.
CREATE TABLE IF NOT EXISTS "TarjetaCreditoCosto" (
    "id"        TEXT NOT NULL,
    "tarjetaId" TEXT NOT NULL,
    "costoId"   TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TarjetaCreditoCosto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TarjetaCreditoCosto_tarjetaId_costoId_key"
  ON "TarjetaCreditoCosto"("tarjetaId", "costoId");
CREATE INDEX IF NOT EXISTS "TarjetaCreditoCosto_costoId_idx"
  ON "TarjetaCreditoCosto"("costoId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TarjetaCreditoCosto_tarjetaId_fkey') THEN
    ALTER TABLE "TarjetaCreditoCosto"
      ADD CONSTRAINT "TarjetaCreditoCosto_tarjetaId_fkey"
      FOREIGN KEY ("tarjetaId") REFERENCES "TarjetaCredito"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TarjetaCreditoCosto_costoId_fkey') THEN
    ALTER TABLE "TarjetaCreditoCosto"
      ADD CONSTRAINT "TarjetaCreditoCosto_costoId_fkey"
      FOREIGN KEY ("costoId") REFERENCES "CostoRecurrente"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

ALTER TABLE "TarjetaCreditoCosto" ENABLE ROW LEVEL SECURITY;

-- ── PagoPlanilla ────────────────────────────────────────────────────────────
-- El libro de lo que se PAGO, una fila por persona y por quincena. El monto es
-- PROPIO y congelado como snapshot: CostoRecurrente.monto es el all-in ESTIMADO
-- y el motor jamas lee montoBase, asi que no existe un bruto quincenal que
-- partir. NO entra a la caja neta: ahi el burn lo produce CostoRecurrente y
-- sumar esto seria doble conteo.
CREATE TABLE IF NOT EXISTS "PagoPlanilla" (
    "id"                 TEXT NOT NULL,
    -- nullable + SetNull: dar de baja a la persona NO borra la historia de pagos.
    "sujetoTeamMemberId" TEXT,
    -- snapshot del nombre, para que la fila se lea sola aunque el vinculo muera.
    "sujetoNombre"       TEXT NOT NULL,
    "periodo"            TEXT NOT NULL,
    "quincena"           INTEGER NOT NULL,
    "fechaProgramada"    DATE NOT NULL,
    "monto"              DECIMAL(12,2) NOT NULL,
    "moneda"             "CobranzaMoneda" NOT NULL,
    "estado"             "PagoPlanillaEstado" NOT NULL DEFAULT 'PENDIENTE',
    "fechaPago"          DATE,
    -- INV18: ningun PAGADO sin confirmadoPor (espejo de INV3 en Cobro).
    "confirmadoPor"      TEXT,
    "confirmadoEn"       TIMESTAMP(3),
    "notas"              TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PagoPlanilla_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PagoPlanilla_quincena_check" CHECK ("quincena" IN (1, 2))
);

CREATE UNIQUE INDEX IF NOT EXISTS "PagoPlanilla_sujetoTeamMemberId_periodo_quincena_key"
  ON "PagoPlanilla"("sujetoTeamMemberId", "periodo", "quincena");
CREATE INDEX IF NOT EXISTS "PagoPlanilla_periodo_quincena_idx"
  ON "PagoPlanilla"("periodo", "quincena");
CREATE INDEX IF NOT EXISTS "PagoPlanilla_estado_idx" ON "PagoPlanilla"("estado");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PagoPlanilla_sujetoTeamMemberId_fkey') THEN
    ALTER TABLE "PagoPlanilla"
      ADD CONSTRAINT "PagoPlanilla_sujetoTeamMemberId_fkey"
      FOREIGN KEY ("sujetoTeamMemberId") REFERENCES "TeamMember"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

ALTER TABLE "PagoPlanilla" ENABLE ROW LEVEL SECURITY;

-- ── ComisionPartner ─────────────────────────────────────────────────────────
-- Lo que Smarteam GANA de un aliado comercial (HubSpot, Atom Chat, Cooby).
-- Es un INGRESO: superficie ADMIN, gate cobranza.read, sin deny-all.
-- `partner` es un string normalizado y no una FK: ninguno de los cuatro existe
-- como Client hoy, e inventarlos para tener la FK seria fabricar cartera.
CREATE TABLE IF NOT EXISTS "ComisionPartner" (
    "id"            TEXT NOT NULL,
    "partner"       TEXT NOT NULL,
    "concepto"      TEXT,
    "monto"         DECIMAL(12,2) NOT NULL,
    "moneda"        "CobranzaMoneda" NOT NULL,
    "fecha"         DATE NOT NULL,
    -- nullable: se liga a un Client de kind ALIADO solo si existe.
    "clientId"      TEXT,
    "notas"         TEXT,
    "registradoPor" TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComisionPartner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ComisionPartner_fecha_idx" ON "ComisionPartner"("fecha");
CREATE INDEX IF NOT EXISTS "ComisionPartner_partner_idx" ON "ComisionPartner"("partner");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComisionPartner_clientId_fkey') THEN
    ALTER TABLE "ComisionPartner"
      ADD CONSTRAINT "ComisionPartner_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

ALTER TABLE "ComisionPartner" ENABLE ROW LEVEL SECURITY;

-- ── ReglaComisionVendedor ───────────────────────────────────────────────────
-- El % que le toca a una persona sobre lo COBRADO. `clientId` null = todos los
-- clientes; la regla MAS ESPECIFICA gana. `porcentaje` va en PUNTOS
-- PORCENTUALES (10.0000 = 10%), no en fraccion: asi la fila se lee como la
-- gente dice el numero.
CREATE TABLE IF NOT EXISTS "ReglaComisionVendedor" (
    "id"           TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    -- nullable a proposito: null = aplica a TODOS los clientes.
    "clientId"     TEXT,
    "porcentaje"   DECIMAL(6,4) NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "vigenteHasta" DATE,
    "notas"        TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReglaComisionVendedor_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReglaComisionVendedor_porcentaje_check"
      CHECK ("porcentaje" > 0 AND "porcentaje" <= 100)
);

CREATE INDEX IF NOT EXISTS "ReglaComisionVendedor_teamMemberId_clientId_idx"
  ON "ReglaComisionVendedor"("teamMemberId", "clientId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReglaComisionVendedor_teamMemberId_fkey') THEN
    ALTER TABLE "ReglaComisionVendedor"
      ADD CONSTRAINT "ReglaComisionVendedor_teamMemberId_fkey"
      FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReglaComisionVendedor_clientId_fkey') THEN
    ALTER TABLE "ReglaComisionVendedor"
      ADD CONSTRAINT "ReglaComisionVendedor_clientId_fkey"
      FOREIGN KEY ("clientId") REFERENCES "Client"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

ALTER TABLE "ReglaComisionVendedor" ENABLE ROW LEVEL SECURITY;

-- ── ComisionVendedor ────────────────────────────────────────────────────────
-- La comision DEVENGADA es una vista derivada de los cobros COBRADO cruzados
-- con la regla vigente — no existe como fila. Esta tabla guarda la comision
-- LIQUIDADA, con snapshot autosuficiente (patron CostoMovimiento): se lee sola
-- aunque cambien la regla, el cobro o la persona.
CREATE TABLE IF NOT EXISTS "ComisionVendedor" (
    "id"             TEXT NOT NULL,
    -- nullable + SetNull: la historia sobrevive a la baja de la persona.
    "teamMemberId"   TEXT,
    "vendedorNombre" TEXT NOT NULL,
    "periodo"        TEXT NOT NULL,
    "base"           DECIMAL(12,2) NOT NULL,
    "porcentaje"     DECIMAL(6,4) NOT NULL,
    "monto"          DECIMAL(12,2) NOT NULL,
    "moneda"         "CobranzaMoneda" NOT NULL,
    -- Que cobros la produjeron. Es lo que consulta el freno 409 del revert.
    "cobroIds"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    -- Snapshot por cobro (cliente, fecha, monto) para que la fila se explique sola.
    "detalle"        JSONB,
    -- La quincena en la que se pago junto al salario. nullable: se puede
    -- liquidar sin engancharla todavia a un pago.
    "pagoPlanillaId" TEXT,
    "liquidadoPor"   TEXT NOT NULL,
    "liquidadoEn"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notas"          TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComisionVendedor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ComisionVendedor_teamMemberId_periodo_idx"
  ON "ComisionVendedor"("teamMemberId", "periodo");
CREATE INDEX IF NOT EXISTS "ComisionVendedor_pagoPlanillaId_idx"
  ON "ComisionVendedor"("pagoPlanillaId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComisionVendedor_teamMemberId_fkey') THEN
    ALTER TABLE "ComisionVendedor"
      ADD CONSTRAINT "ComisionVendedor_teamMemberId_fkey"
      FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComisionVendedor_pagoPlanillaId_fkey') THEN
    ALTER TABLE "ComisionVendedor"
      ADD CONSTRAINT "ComisionVendedor_pagoPlanillaId_fkey"
      FOREIGN KEY ("pagoPlanillaId") REFERENCES "PagoPlanilla"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

ALTER TABLE "ComisionVendedor" ENABLE ROW LEVEL SECURITY;

-- ── updatedAt SIN default ───────────────────────────────────────────────────
-- El DEFAULT de arriba existe solo para que el CREATE funcione; `@updatedAt` lo
-- escribe el cliente Prisma en cada write. Dejarlo puesto es DERIVA: Prisma no
-- modela ese default y `migrate diff` lo reporta para siempre, ensuciando el
-- unico detector de deriva ajena que tenemos entre las dos PCs. Mismo patron
-- que scripts~sql~2026-07-27-ingreso-variable.sql.
ALTER TABLE "TarjetaCredito"        ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "PagoPlanilla"          ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "ComisionPartner"       ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "ReglaComisionVendedor" ALTER COLUMN "updatedAt" DROP DEFAULT;

COMMIT;
