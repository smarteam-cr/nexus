-- 2026-07-30 · Tanda C: en qué punto quedó cada alta de proyecto
--
-- ADITIVO: 11 columnas en "Project" + 1 índice parcial. No borra ni renombra nada. Ninguna
-- columna existente cambia de tipo ni de default.
--
-- ── EL DEPLOY ES INVISIBLE, Y ESO ES EL DISEÑO ───────────────────────────────
-- Todo lo que existe hoy queda con "altaEstado" = NULL, y la tabla de verdad
-- (`lib/projects/alta.ts`) trata NULL exactamente igual que 'listo' en las seis preguntas
-- que importan: se ve · cuenta para cartera · cuenta para cobranza · es publicable · es
-- retomable · cuál es el próximo paso. Un test lo exige (`alta.test.ts`). Así que aplicar
-- este SQL no cambia una sola pantalla, y se puede correr ANTES del deploy sin coordinar.
--
-- Cómo aplicarlo (revisá antes de correr):
--   npx prisma db execute --file scripts/sql/2026-07-30-alta-de-proyecto.sql
-- Después:
--   npx prisma generate      (NO `db:sync` — eso corre db push y DROPPEA columnas)
--   reiniciar el dev server  (el Prisma client viejo no conoce las columnas)
--
-- ⚠ ORDEN para producción: este SQL → deploy de la imagen. No hay backfill: NULL ya es la
--   respuesta correcta para todo lo preexistente.
--
-- ── QUÉ SON ESTAS COLUMNAS, Y QUÉ NO SON ─────────────────────────────────────
-- "altaEstado" es lo único que DECIDE algo (apaga cobranza, cartera, publicación y watchdog
-- mientras el alta no termina). Las cuatro que le siguen son el RECIBO de lo que pidió la
-- persona: qué tipo eligió, si lo declaró interno, de qué proyecto dijo que cuelga, y por qué
-- no puso trato. No deciden nada.
--
-- ⚠ EL RECIBO NO ES LA VERDAD. La verdad del tipo y del hermano la escribe el ESPEJO
-- (`lib/hubspot/sync-projects.ts`) leyéndolos de HubSpot, y ninguna de estas columnas es una
-- de las cuatro columnas de clase que protege la guarda de escritor único
-- (`lib/projects/scope-coverage.test.ts`). Si el recibo alimentara la tabla de decisiones,
-- Nexus estaría decidiendo facturación con lo que alguien tipeó en un formulario en vez de
-- con lo que quedó en el CRM — y diez minutos después el sync lo contradiría.

BEGIN;

-- ── Lo único que decide ──────────────────────────────────────────────────────
-- NULL = nació antes de esta tanda, o lo trajo el espejo desde HubSpot (que es como nacen
-- hoy 99 de cada 100). Los tres valores vivos: 'pendiente_crm' | 'pendiente_espejo' | 'listo'.
-- Sin enum de Postgres a propósito, por el mismo motivo que `hubspotPipelineId`: un enum
-- obliga a cirugía para agregar o sacar un valor, y la tabla de verdad ya vive en el código
-- con un test que la transcribe entera.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "altaEstado" TEXT;

-- ── El recibo de lo que pidió la persona (no decide nada) ────────────────────
-- El pipeline que ELIGIÓ en la pantalla. Se compara contra el que devuelve HubSpot: si no
-- coinciden, el alta NO pasa a 'listo'. Sin esa comparación un proyecto podía quedar
-- terminado en la fila legacy — o sea, facturable y con los documentos de otro tipo.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "altaPipelineElegido" TEXT;
-- Si marcó "proyecto interno de Smarteam". Es lo que habilita la excepción al trato ganado.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "altaInternoDeclarado" BOOLEAN;
-- El id de HubSpot de la implementación de la que dijo que cuelga. Es lo ÚNICO que impide
-- cobrar dos veces el mismo trabajo, así que se guarda lo declarado para poder exigir después
-- que el espejo lo haya resuelto de verdad.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "altaHermanoHsId" TEXT;
-- Por qué se aceptó sin trato ganado. Texto libre y corto: existe para que dentro de un año
-- se pueda contestar "¿y éste por qué no tenía trato?" sin adivinar.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "altaSinTratoMotivo" TEXT;

-- ── Telemetría del reintento (para el cartel y para diagnosticar) ────────────
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "altaError" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "altaIntentos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "altaUltimoIntentoAt" TIMESTAMP(3);
-- Cuándo arrancó. Acota la búsqueda de un record para adoptar: solo se adopta uno creado
-- DESPUÉS de este instante, así el alta nunca se apropia de un proyecto viejo de la empresa.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "altaIniciadaAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "altaActorEmail" TEXT;
-- El sello que hace que la reclasificación de sesiones (~US$1 por corrida) se pague UNA vez
-- aunque se reintente diez. Se escribe en la misma operación que dispara la reclasificación.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "altaReclasificadoAt" TIMESTAMP(3);

-- Índice PARCIAL: las únicas filas que se consultan por este campo son las que tienen un alta
-- sin terminar (el barrido de reintento y el chip de la ficha del cliente). Un índice completo
-- sobre una columna que va a ser NULL en el 99% de las filas es peso muerto.
CREATE INDEX IF NOT EXISTS "Project_altaEstado_pendiente_idx"
  ON "Project" ("altaEstado") WHERE "altaEstado" IS NOT NULL;

COMMIT;

-- ── Verificación ─────────────────────────────────────────────────────────────
-- 1) Las 11 columnas existen (tiene que dar 11):
--    SELECT count(*) FROM information_schema.columns
--      WHERE table_name = 'Project' AND column_name LIKE 'alta%';
--
-- 2) NADIE quedó con un alta en curso por accidente (tiene que dar 0 filas). Si diera algo,
--    esas filas desaparecerían de cobranza y de la cartera:
--    SELECT "altaEstado", count(*) FROM "Project" WHERE "altaEstado" IS NOT NULL GROUP BY 1;
--
-- 3) El índice parcial quedó:
--    SELECT indexname FROM pg_indexes
--      WHERE tablename = 'Project' AND indexname = 'Project_altaEstado_pendiente_idx';
