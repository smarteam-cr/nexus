-- 2026-10-03 · Rediseño de Finanzas: una vista por persona, revisión del trabajo y cierre del mes
--
-- Pedido de Elías (2026-10-03): «Rediseña el módulo» y, con el diseño revisado, «Aplícalo a todo». Dinia registra, Alex
-- revisa, decide y cierra el mes, dirección mira el resultado. Ver docs/finanzas-rediseno-plan.md.
--
-- ADITIVO: dos columnas que aceptan vacío y dos tablas nuevas. Nada existente cambia de forma.
-- Re-ejecutable: la base local re-aplica todos los SQL con fecha en cada bootstrap.
--
-- ⛔ ORDEN: esto va ANTES del deploy. La columna de "TeamMember" la lee CADA página de Nexus (el usuario se carga con su
-- fila completa): sin ella no carga nada. La revisión de salud del deploy lo detecta y vuelve atrás solo.
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-03-finanzas-rediseno.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

BEGIN;

-- ── La vista de Finanzas de cada persona ────────────────────────────────────────────
-- Solo cuenta para un SUPER_ADMIN: vacío o SUPERVISA = el panel completo de Alex; DIRECCION = solo los reportes. El
-- resto del equipo con Cobranza tiene la vista de quien registra, sin elegir nada.
ALTER TABLE "TeamMember" ADD COLUMN IF NOT EXISTS "vistaFinanzas" TEXT;
ALTER TABLE "TeamMember" DROP CONSTRAINT IF EXISTS "TeamMember_vistaFinanzas_check";
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_vistaFinanzas_check"
  CHECK ("vistaFinanzas" IS NULL OR "vistaFinanzas" IN ('SUPERVISA', 'DIRECCION'));

-- ── Quién anotó cada gasto ───────────────────────────────────────────────────────────
-- Los gastos puntuales no guardaban autor. Sin él no se puede revisar lo que registró el equipo. Los viejos quedan
-- vacíos: se anotaron antes de que existiera la revisión.
ALTER TABLE "GastoPuntual" ADD COLUMN IF NOT EXISTS "registradoPor" TEXT;

-- ── La revisión de Alex ──────────────────────────────────────────────────────────────
-- Una fila por registro revisado (un pago o un gasto), con la HUELLA de sus números al revisarlo: si cambian después,
-- vuelve a «por revisar» solo. DEVUELTO = Alex lo devolvió con un comentario; CORREGIDO = quien lo registró dice que ya
-- lo arregló y vuelve a la lista de Alex.
CREATE TABLE IF NOT EXISTS "RevisionRegistro" (
  "id"          TEXT NOT NULL,
  "tipo"        TEXT NOT NULL,
  "registroId"  TEXT NOT NULL,
  "estado"      TEXT NOT NULL,
  "huella"      TEXT NOT NULL,
  "comentario"  TEXT,
  "revisadoPor" TEXT NOT NULL,
  "revisadoEn"  TIMESTAMP(3) NOT NULL,
  "corregidoPor" TEXT,
  "corregidoEn" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RevisionRegistro_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RevisionRegistro_tipo_check" CHECK ("tipo" IN ('PAGO', 'GASTO')),
  CONSTRAINT "RevisionRegistro_estado_check" CHECK ("estado" IN ('BIEN', 'DEVUELTO', 'CORREGIDO')),
  -- Devolver sin decir por qué no le sirve a nadie.
  CONSTRAINT "RevisionRegistro_devuelto_con_comentario" CHECK ("estado" <> 'DEVUELTO' OR "comentario" IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS "RevisionRegistro_tipo_registroId_key" ON "RevisionRegistro" ("tipo", "registroId");
CREATE INDEX IF NOT EXISTS "RevisionRegistro_estado_idx" ON "RevisionRegistro" ("estado");

-- ── El cierre del mes ────────────────────────────────────────────────────────────────
-- Una fila por mes que alguien tocó: ABIERTO mientras se trabaja (por ejemplo, cuando Dinia avisa que ya anotó todos los
-- gastos), CERRADO cuando Alex lo cierra. Guarda los números del momento del cierre: si después cambian, el punto de
-- equilibrio lo dice. Reabrir pide motivo.
CREATE TABLE IF NOT EXISTS "CierreMes" (
  "id"               TEXT NOT NULL,
  "periodo"          TEXT NOT NULL,
  "estado"           TEXT NOT NULL DEFAULT 'ABIERTO',
  "gastosListosPor"  TEXT,
  "gastosListosEn"   TIMESTAMP(3),
  "cerradoPor"       TEXT,
  "cerradoEn"        TIMESTAMP(3),
  "numeros"          JSONB,
  "reabiertoPor"     TEXT,
  "reabiertoEn"      TIMESTAMP(3),
  "motivoReapertura" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CierreMes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CierreMes_periodo_check" CHECK ("periodo" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "CierreMes_estado_check" CHECK ("estado" IN ('ABIERTO', 'CERRADO')),
  -- Un mes cerrado sabe quién y cuándo, y con qué números.
  CONSTRAINT "CierreMes_cerrado_firmado" CHECK (
    "estado" <> 'CERRADO' OR ("cerradoPor" IS NOT NULL AND "cerradoEn" IS NOT NULL AND "numeros" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS "CierreMes_periodo_key" ON "CierreMes" ("periodo");

ALTER TABLE "RevisionRegistro" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CierreMes" ENABLE ROW LEVEL SECURITY;

COMMIT;
