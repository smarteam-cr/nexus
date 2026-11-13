-- 2026-11-13 · Las metas de gerencia que dan plata: el programa de partners de HubSpot y el bono de recurrentes.
--
-- POR QUÉ. En la reunión de gerencia se revisan a mano tres metas: mantener el nivel Elite de HubSpot (vale unos
-- US$2.000 al mes en comisiones; el requisito subió 25 % y faltan unos US$7.000), la meta de septiembre a diciembre de
-- US$32.588 en ventas nuevas para el bono del 15 % de HubSpot, y los US$12.000 de ingresos recurrentes que le dan
-- US$500 a Elías González, Alexander Vanegas y Andrés Pinzón. Nexus mide el avance con lo que ya sabe (Partner,
-- las metas de HubSpot, Cobranza, los negocios ganados) y dirección carga lo que HubSpot no expone.
-- Decisión completa: docs/DECISIONS.md › «Las metas de gerencia con HubSpot».
--
-- QUÉ ENTRA (ADITIVO; se puede correr dos veces):
--   1. La tabla "MetaDeGerencia", con RLS y deny-all RESTRICTIVE (solo la lee el servidor, como Finanzas).
--   2. Las tres metas de la reunión, con ids fijos (ON CONFLICT DO NOTHING: correrlo otra vez no pisa lo editado).
--      El requisito exacto de Elite queda VACÍO a propósito: nadie lo tiene escrito; la pantalla lo pide.
--
-- ⚠ ORDEN: ANTES del deploy. Sin la tabla, /api/health responde 503 (el cliente Prisma la conoce) y el deploy se
-- revierte solo. El código viejo no la conoce.
--
-- Volver atrás (borra lo cargado): DROP TABLE IF EXISTS "MetaDeGerencia";
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-11-13-metas-de-gerencia.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate + reiniciar el dev server · npm run check:esquema.
-- ⛔ NUNCA `prisma db push`.

CREATE TABLE IF NOT EXISTS "MetaDeGerencia" (
  "id"              TEXT NOT NULL,
  "nombre"          TEXT NOT NULL,
  "medida"          TEXT NOT NULL,
  "objetivoUsd"     DECIMAL(14,2),
  "desde"           DATE,
  "hasta"           DATE,
  "corteEn"         DATE,
  "premio"          TEXT,
  "paraQuien"       TEXT,
  "avanceManualUsd" DECIMAL(14,2),
  "avanceManualAl"  DATE,
  "nota"            TEXT,
  "archivada"       BOOLEAN NOT NULL DEFAULT false,
  "creadaPor"       TEXT NOT NULL,
  "actualizadaPor"  TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetaDeGerencia_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MetaDeGerencia_objetivo_positivo" CHECK ("objetivoUsd" IS NULL OR "objetivoUsd" > 0),
  CONSTRAINT "MetaDeGerencia_periodo_en_orden" CHECK ("desde" IS NULL OR "hasta" IS NULL OR "desde" <= "hasta")
);

CREATE INDEX IF NOT EXISTS "MetaDeGerencia_archivada_createdAt_idx" ON "MetaDeGerencia" ("archivada", "createdAt");

ALTER TABLE "MetaDeGerencia" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deny_all_non_superuser ON "MetaDeGerencia";
CREATE POLICY deny_all_non_superuser ON "MetaDeGerencia" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);

-- ── Las tres metas de la reunión de gerencia ────────────────────────────────────────────────────────────────────────
INSERT INTO "MetaDeGerencia" ("id", "nombre", "medida", "objetivoUsd", "desde", "hasta", "corteEn", "premio", "paraQuien",
                              "nota", "creadaPor", "actualizadaPor", "createdAt", "updatedAt")
VALUES
  ('meta-gerencia-hubspot-elite',
   'Mantener el nivel Elite de HubSpot', 'mrr_gestionado_partner', NULL, NULL, NULL, NULL,
   'Mantener Elite: unos US$2.000 al mes en comisiones de HubSpot.', NULL,
   'El requisito subió 25 % y en la reunión de gerencia se dijo que faltan unos US$7.000. Falta cargar el requisito exacto y su fecha de corte, como los muestra el portal de partners de HubSpot. Por confirmar: que el requisito se mide en MRR gestionado.',
   'nexus:sql-2026-11-13', 'nexus:sql-2026-11-13', TIMESTAMP '2026-11-13 00:00:01', TIMESTAMP '2026-11-13 00:00:01'),
  ('meta-gerencia-hubspot-bono-15',
   'Bono del 15 % de HubSpot por ventas nuevas', 'mrr_negocios_partner', 32588, DATE '2026-09-01', DATE '2026-12-31', DATE '2026-12-31',
   'Bono del 15 % de HubSpot.', NULL,
   'Por confirmar: qué cuenta HubSpot como venta nueva para este bono. Nexus suma el MRR de los negocios que Smarteam trajo o ayudó a cerrar, según las metas del plan de partner en HubSpot.',
   'nexus:sql-2026-11-13', 'nexus:sql-2026-11-13', TIMESTAMP '2026-11-13 00:00:02', TIMESTAMP '2026-11-13 00:00:02'),
  ('meta-gerencia-ingresos-recurrentes',
   'Ingresos recurrentes de US$12.000', 'mrr_servicios_recurrentes', 12000, NULL, NULL, NULL,
   'US$500 a cada uno.', 'Elías González, Alexander Vanegas y Andrés Pinzón',
   'Por confirmar con Marco: si los US$12.000 son lo que se cobra al mes por servicios recurrentes (lo que mide Nexus: los cobros del mes en Cobranza) o lo vendido en recurrentes en un período, y la fecha de corte.',
   'nexus:sql-2026-11-13', 'nexus:sql-2026-11-13', TIMESTAMP '2026-11-13 00:00:03', TIMESTAMP '2026-11-13 00:00:03')
ON CONFLICT ("id") DO NOTHING;
