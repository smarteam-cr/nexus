-- 2026-11-13 · Cobranza: el responsable de cada venta sin cobro, el paso a producción, los conectores en mora y el fin
-- de los contratos recurrentes
--
-- Pedido de Elías (puntos 11, 14, 15 y 16 del frente de cobranza). Reglas en lib/cobranza/responsables.ts,
-- conectores-en-mora.ts, paso-a-produccion.ts y contratos.ts; el porqué en DECISIONS «Cobranza: cada pendiente con su
-- responsable (2026-11-13)».
--
--   · "VentaGanada"         + responsableCobroEmail (null = el responsable por defecto) y la marca «no genera cobro»
--                           (noGeneraCobroEn/Por/Motivo): una venta de verdad sin cobro propio. Sale de la lista de
--                           Seguimiento y SIGUE en el vendido, la cuota, el bono y la comisión. NO es `excluida` («no es
--                           una venta»), que la sacaría de todo eso (revisión del 2026-11-13).
--   · "ServicioContratado"  + contratoFin, contratoRenovacion (texto con CHECK), desactivacionConfirmadaPor/En.
--   · "CobroDelProyecto"    TABLA NUEVA, una fila por proyecto: quién confirma el paso a producción, quién cobra y el
--                           paso mismo (día, quién y cuándo).
--
-- ADITIVO: columnas nullable y una tabla nueva. Nada existente cambia de valor. Re-ejecutable.
--
-- ⛔ ORDEN: esto va ANTES del deploy del código que trae los campos: sin las columnas, /api/health responde 503 y el
-- deploy se revierte solo (toda lectura de ServicioContratado las pide).
--
--   PowerShell:  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-11-13-cobranza-responsables-y-contratos.sql
--
-- ⚠ SIN `--schema`: con Prisma 7 esa opción ya no existe. NUNCA `prisma db push`.
-- Después, en la máquina de desarrollo: `npx prisma generate` y REINICIAR el dev server.

BEGIN;

ALTER TABLE "VentaGanada" ADD COLUMN IF NOT EXISTS "responsableCobroEmail" TEXT;
ALTER TABLE "VentaGanada" ADD COLUMN IF NOT EXISTS "noGeneraCobroEn" TIMESTAMP(3);
ALTER TABLE "VentaGanada" ADD COLUMN IF NOT EXISTS "noGeneraCobroPor" TEXT;
ALTER TABLE "VentaGanada" ADD COLUMN IF NOT EXISTS "noGeneraCobroMotivo" TEXT;

ALTER TABLE "ServicioContratado" ADD COLUMN IF NOT EXISTS "contratoFin" TIMESTAMP(3);
ALTER TABLE "ServicioContratado" ADD COLUMN IF NOT EXISTS "contratoRenovacion" TEXT;
ALTER TABLE "ServicioContratado" ADD COLUMN IF NOT EXISTS "desactivacionConfirmadaPor" TEXT;
ALTER TABLE "ServicioContratado" ADD COLUMN IF NOT EXISTS "desactivacionConfirmadaEn" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "CobroDelProyecto" (
  "id"                      TEXT NOT NULL,
  "projectId"               TEXT NOT NULL,
  "confirmaProduccionEmail" TEXT,
  "cobraEmail"              TEXT,
  "produccionDesde"         TIMESTAMP(3),
  "produccionConfirmadaPor" TEXT,
  "produccionConfirmadaEn"  TIMESTAMP(3),
  "actualizadoPor"          TEXT NOT NULL,
  "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"               TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CobroDelProyecto_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CobroDelProyecto_projectId_fkey" FOREIGN KEY ("projectId")
    REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CobroDelProyecto_projectId_key" ON "CobroDelProyecto" ("projectId");

DO $$
BEGIN
  -- «No genera cobro» lleva siempre cuándo, quién y por qué, juntos.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VentaGanada_no_genera_cobro_completa') THEN
    ALTER TABLE "VentaGanada" ADD CONSTRAINT "VentaGanada_no_genera_cobro_completa"
      CHECK (
        ("noGeneraCobroEn" IS NULL) = ("noGeneraCobroPor" IS NULL)
        AND ("noGeneraCobroEn" IS NULL) = ("noGeneraCobroMotivo" IS NULL)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServicioContratado_contratoRenovacion_check') THEN
    ALTER TABLE "ServicioContratado" ADD CONSTRAINT "ServicioContratado_contratoRenovacion_check"
      CHECK ("contratoRenovacion" IS NULL OR "contratoRenovacion" IN ('automatica', 'manual', 'no-renueva'));
  END IF;
  -- La desactivación confirmada lleva siempre quién y cuándo, juntos.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServicioContratado_desactivacion_completa') THEN
    ALTER TABLE "ServicioContratado" ADD CONSTRAINT "ServicioContratado_desactivacion_completa"
      CHECK (("desactivacionConfirmadaPor" IS NULL) = ("desactivacionConfirmadaEn" IS NULL));
  END IF;
  -- El paso a producción lleva siempre el día, quién y cuándo, juntos.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CobroDelProyecto_produccion_completa') THEN
    ALTER TABLE "CobroDelProyecto" ADD CONSTRAINT "CobroDelProyecto_produccion_completa"
      CHECK (
        ("produccionDesde" IS NULL) = ("produccionConfirmadaPor" IS NULL)
        AND ("produccionDesde" IS NULL) = ("produccionConfirmadaEn" IS NULL)
      );
  END IF;
END $$;

-- Sin esto, anon la lee con la publishable key del bundle (ARCHITECTURE §4.5).
ALTER TABLE "CobroDelProyecto" ENABLE ROW LEVEL SECURITY;

COMMIT;
