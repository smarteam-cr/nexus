-- 2026-07-24 · ProjectCanvas.disabledAt — apagar una pieza SIN borrarla
--
-- ADITIVO: 3 columnas nullable. Sin índices, sin backfill, sin borrar nada.
--
-- POR QUÉ: hasta hoy un proyecto no podía prescindir de una pieza. Apagarla solo se
-- podía "logrando" borrar el canvas — y el borrado cascadea a secciones y bloques, sin
-- deshacer. Medido en la base: los 118 proyectos tenían EXACTAMENTE las mismas 5 piezas
-- y solo 3 combinaciones distintas en total. Nada era opcional de verdad.
--
-- POR QUÉ EN ESTA TABLA Y NO EN UNA APARTE: la promesa entera de esta fase es "apagar
-- SIN perder contenido". Con el interruptor en la MISMA fila que el contenido, apagar es
-- un UPDATE de una columna y no existe ningún camino de código donde apagar pueda tocar
-- una sección o un bloque. Con una tabla de decisiones aparte, el día que alguien escriba
-- una limpieza, "la pieza está apagada" y "este canvas sobra" se parecen demasiado.
--
-- POR QUÉ FECHA Y NO BOOLEANO: interesa CUÁNDO se apagó, que es parte del historial del
-- proyecto. Ausente = la pieza está activa.
--
-- `disabledBy` es el correo y NO una FK: el rastro tiene que sobrevivir a que la persona
-- salga del equipo. Mismo criterio que `Project.healthStatusOverrideBy`,
-- `ProjectStageGate.markedBy` y `DevEstimate.createdByEmail`.
--
-- SIN ÍNDICE a propósito: el filtro siempre corre junto a `projectId`, y el índice que ya
-- existe acota a ~7 filas. Un índice más sobre una base compartida con producción sería
-- DDL sin beneficio.
--
-- SEGURO EN LA VENTANA ENTRE SQL Y DEPLOY: las tres son nullable, el código viejo las
-- ignora, y `disabledAt IS NULL` es cierto para toda fila existente → nada cambia hasta
-- que alguien apague algo a mano.
--
-- Cómo aplicarlo (revisá antes de correr):
--   npx prisma db execute --file scripts/sql/2026-07-24-projectcanvas-disabled.sql --schema prisma/schema.prisma
-- Después:  npx prisma generate     ← NUNCA `db push`: la base es compartida entre las
--                                     dos PC y producción, y un push con el schema viejo
--                                     dropea lo que la otra PC agregó.

BEGIN;

ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "disabledAt"     TIMESTAMP(3);
ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "disabledBy"     TEXT;
ALTER TABLE "ProjectCanvas" ADD COLUMN IF NOT EXISTS "disabledReason" TEXT;

COMMIT;

-- Verificación (esperado inmediatamente después: 0):
--   SELECT count(*) FROM "ProjectCanvas" WHERE "disabledAt" IS NOT NULL;
