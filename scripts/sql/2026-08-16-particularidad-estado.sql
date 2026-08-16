-- 2026-08-16 · Las desviaciones del cronograma ganan ABIERTA / CERRADA
--
-- ADITIVO: 1 enum nuevo + 4 columnas en "Particularidad". No borra, no renombra, no cambia
-- ningún tipo existente. Todas las filas actuales quedan en 'ABIERTA', que es exactamente lo
-- que significan hoy (no existía forma de cerrarlas).
--
-- Cómo aplicarlo (revisá antes de correr):
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-08-16-particularidad-estado.sql --schema prisma/schema.prisma
-- Después:
--   npx prisma generate      (NO `db push` — droppearía columnas de la otra PC)
--   reiniciar el dev server  (el Prisma client viejo no conoce las columnas; INV7 lo caza)
--
-- ⚠ ORDEN: esto va ANTES del deploy. El código nuevo SELECCIONA `estado`; contra una base sin
-- la columna, toda lectura del cronograma revienta. Es aditivo, así que correrlo antes no
-- rompe nada del código viejo (que simplemente la ignora).
--
-- ── ⛔ POR QUÉ `NOT NULL DEFAULT`, Y NO UNA COLUMNA NULLABLE ─────────────────
-- La tentación es dejarla nullable y tratar NULL como «abierta», que es el patrón fail-open
-- que este mismo modelo ya usa para `needsValidation`. Acá sería un error, y el relevamiento
-- del 2026-08-16 midió por qué: el chokepoint que decide qué ve el CLIENTE
-- (`lib/external/timeline-view.ts`) es un AND de igualdades literales, y en SQL
-- `estado = 'ABIERTA'` **no matchea NULL** — ni tampoco `estado <> 'CERRADA'`. Con la columna
-- nullable, el día del deploy el 100% del corpus es NULL, así que:
--   · ninguna fila legacy cruzaría al cliente y el próximo «Subir» de cualquier proyecto ya
--     entregado lo dejaría sin bitácora;
--   · el PDF del cronograma, que lee EN VIVO, se vaciaría sin que nadie republique;
--   · y el agente dejaría de ver las desviaciones ya registradas, las volvería a proponer con
--     otra redacción, y el corrimiento se contaría dos veces — el defecto de Wherex, «13
--     semanas mostradas contra 8 reales».
-- Con `NOT NULL DEFAULT 'ABIERTA'` no hay NULL en ninguna fila, así que ninguna consulta
-- necesita acordarse del caso raro. Hay UNA sola representación de «abierta».
--
-- ⚠ `ADD COLUMN ... NOT NULL DEFAULT` rellena las filas existentes en el mismo comando
-- (Postgres 11+, sin reescribir la tabla). No hace falta un backfill aparte — pero SÍ hace
-- falta verificarlo: la consulta de control está al final.
--
-- ── QUÉ SIGNIFICA CADA COLUMNA ───────────────────────────────────────────────
-- estado:       ABIERTA = el hecho sigue vigente y hay algo que atender.
--               CERRADA = se resolvió. ⚠ NO significa «no ocurrió»: las semanas que costó
--               SIGUEN contando, porque el calendario ya se movió y cerrar no lo devuelve.
--               Lo que se apaga es la ACCIÓN (dejar de perseguirlo), no el registro.
-- resueltaEn:   cuándo se cerró.
-- resueltaPor:  email de quien la cerró (mismo criterio que `AlertaCobro.resueltaPor`).
-- resueltaNota: por qué. Opcional, y es lo único que hace legible la historia seis meses
--               después: «se cerró» sin motivo es indistinguible de «alguien limpió la lista».

DO $$ BEGIN
  CREATE TYPE "ParticularidadEstado" AS ENUM ('ABIERTA', 'CERRADA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Particularidad"
  ADD COLUMN IF NOT EXISTS "estado" "ParticularidadEstado" NOT NULL DEFAULT 'ABIERTA',
  ADD COLUMN IF NOT EXISTS "resueltaEn" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resueltaPor" TEXT,
  ADD COLUMN IF NOT EXISTS "resueltaNota" TEXT;

COMMENT ON COLUMN "Particularidad"."estado" IS
  'ABIERTA = vigente. CERRADA = resuelta; sus semanas SIGUEN contando (cerrar no devuelve calendario), lo que se apaga es la acción pendiente.';
COMMENT ON COLUMN "Particularidad"."resueltaNota" IS
  'Por qué se cerró. Sin esto, «cerrada» es indistinguible de «alguien limpió la lista».';

-- ── VERIFICACIÓN (correr después; tiene que dar 0) ──────────────────────────
-- SELECT COUNT(*) AS sin_estado FROM "Particularidad" WHERE "estado" IS NULL;
--
-- Y el censo de arranque, para tenerlo escrito antes de que alguien cierre la primera:
-- SELECT "estado", COUNT(*) FROM "Particularidad" GROUP BY "estado";
