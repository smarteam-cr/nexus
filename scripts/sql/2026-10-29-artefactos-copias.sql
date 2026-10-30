-- 2026-10-29 · Artefactos, etapa V3: varias copias de un tipo en un proyecto (docs/artefactos-plan.md).
--
-- Por qué:
--   · "ProjectCanvas"."tipoArtefacto" — el TIPO de una copia («planning», «diagnosis», «kickoff», «exploration»,
--     «adoption-plan», «integration»; lib/artefactos/tipos.ts). Solo lo llevan las copias: el documento de siempre de
--     cada tipo conserva su `slug` (lo buscan 105 lugares) y la columna en NULL. Una copia nunca tiene `slug`, así que
--     el índice único parcial (projectId, slug) no la ve.
--   · "ProjectCanvas"."titulo" — el nombre que le pone una persona a cualquier documento (Elías: «que el usuario le pueda
--     cambiar el nombre a cada una»). NULL = el de fábrica: una copia se ve con su `name` y el de siempre con el nombre
--     de su pieza. No se reusa `name` porque hay documentos de siempre con un `name` viejo que hoy no se muestra, y
--     porque `name` de una copia nunca puede ser el de una pieza (la lectura doble de canvasOf la confundiría).
--   · "ProjectCanvas"."terminadoEn" / "terminadoPor" — el estado de cualquier documento, la copia de siempre incluida:
--     NULL = en construcción; con fecha = terminado. Lo leen la entrega, la escala y los agentes para saber cuánto
--     pesa cada copia (Elías, 29 oct: «para que quien los lea lo tome en cuenta»).
--   · El orden es la columna `order` de siempre. Archivar una copia escribe `disabledAt` (la columna de apagar una pieza).
--
-- ADITIVO: 4 columnas nullable, 1 índice y 1 CHECK NOT VALID. Nada se dropea, nada se renombra. Inocuo con el código
-- viejo corriendo (no lee las columnas nuevas). Se puede correr dos veces.
--
-- Y UN PUNTO DE PARTIDA para la columna nueva: lo que ya se le presentó o publicó al cliente nace «terminado», no «en
-- construcción» (si no, en cuanto el tipo tenga una copia, la planificación leería un diagnóstico aprobado como borrador).
-- Solo escribe `terminadoEn`/`terminadoPor`, que nadie lee todavía, y solo la primera vez: si ya hay filas con esta marca
-- (`terminadoPor`), el SQL ya corrió y lo que haya cambiado una persona no se pisa.
-- Simulacro del 2026-10-30 contra producción, solo lectura: 21 filas (19 kickoffs, 1 diagnóstico, 1 planificación). Para
-- repetirlo, un SELECT count(*) con el mismo FROM y WHERE. Para deshacerlo: las filas con esa marca en `terminadoPor`.
--
-- ⚠ ORDEN: este SQL va ANTES del deploy: el listado de documentos del proyecto selecciona las columnas nuevas y sin
-- ellas la ficha del cliente no carga (`/api/health` da 503 y deploy.sh revierte).
--
-- Correr (PowerShell):  $env:ALLOW_PROD_WRITE="1"; npx prisma db execute --file scripts/sql/2026-10-29-artefactos-copias.sql; Remove-Item Env:ALLOW_PROD_WRITE
-- Después: npx prisma generate  +  reiniciar el dev server.
-- ⛔ NUNCA `prisma db push`.

ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "tipoArtefacto" TEXT;
ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "titulo" TEXT;
ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "terminadoEn" TIMESTAMP(3);
ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "terminadoPor" TEXT;

UPDATE "ProjectCanvas" pc
SET "terminadoEn" = now(), "terminadoPor" = 'punto de partida 2026-10-29'
FROM "Project" p
WHERE p."id" = pc."projectId"
  AND pc."terminadoEn" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "ProjectCanvas" ya WHERE ya."terminadoPor" = 'punto de partida 2026-10-29')
  AND (
    pc."estadoDocumento" IN ('presentado', 'aprobado')
    OR (pc."slug" = 'kickoff' AND p."kickoffPublishedAt" IS NOT NULL)
    OR (pc."slug" = 'diagnosis' AND p."diagnosticoPublishedAt" IS NOT NULL)
    OR (pc."slug" = 'planning' AND p."planificacionPublishedAt" IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS "ProjectCanvas_projectId_tipoArtefacto_idx" ON "ProjectCanvas" ("projectId", "tipoArtefacto");

-- Una copia nunca tiene slug: el slug es la marca del documento de siempre de su tipo. NOT VALID: no recorre las filas
-- de hoy (ninguna tiene tipoArtefacto) y vale para toda fila nueva o modificada.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProjectCanvas_copia_sin_slug') THEN
    ALTER TABLE "ProjectCanvas" ADD CONSTRAINT "ProjectCanvas_copia_sin_slug" CHECK ("tipoArtefacto" IS NULL OR "slug" IS NULL) NOT VALID;
  END IF;
END $$;
