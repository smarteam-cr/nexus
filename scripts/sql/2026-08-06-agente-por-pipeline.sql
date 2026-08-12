-- 2026-08-06 · Un agente por tipo de proyecto: `Agent.pipelineKey`
--
-- ADITIVO: 1 columna nullable en "Agent" + 1 índice. No borra, no renombra, no cambia
-- ningún tipo ni default. Cero filas afectadas: nace toda en NULL.
--
-- Cómo aplicarlo (revisá antes de correr):
--   npx prisma db execute --file scripts/sql/2026-08-06-agente-por-pipeline.sql
-- Después:
--   npx prisma generate      (NO `db:sync` — eso corre db push y DROPPEA columnas)
--   reiniciar el dev server  (el Prisma client viejo no conoce la columna)
--
-- ── POR QUÉ UNA COLUMNA Y NO UN `agentGroup` NUEVO ───────────────────────────
-- La tentación es sembrar «handoff-web» como grupo aparte. No se puede: `agentGroup` es
-- la LLAVE de once mapas y ramas del sistema —`AGENT_GROUP_TO_CANVAS`, el `agentGroup`
-- de cada pieza (con un test que exige 1:1 grupo↔pieza), el `switch` de
-- `resolveArtifactGate`, `BLOCK_FORMAT_GROUPS`, el manual…— y un grupo que nadie declaró
-- hace dos cosas malas en silencio: el agente escribe en NINGÚN canvas, y cae al
-- `default: return null` del gate de permisos, o sea que CORRE SIN CELDA DE PERMISO.
--
-- Con la columna aparte, los once mapas siguen intactos: las tres variantes comparten
-- `agentGroup = 'handoff'` y se distinguen por el pipeline.
--
-- ── POR QUÉ NULLABLE, Y POR QUÉ ESO ES EL REQUISITO DURO ─────────────────────
-- `NULL` significa «sirve para cualquier tipo de proyecto». El agente de handoff que
-- existe hoy (Handoff Sales→CS, 17k caracteres de metodología) queda en NULL y NO se le
-- toca un carácter. Cuando un proyecto de Implementación pida su agente, el resolver
-- busca `pipelineKey = 'customer-success'`, no lo encuentra, y cae al de NULL: devuelve
-- LA MISMA FILA de hoy, con el mismo id y el mismo prompt. No es «parecido»: es idéntico.
-- Ése es el mecanismo que garantiza que una Implementación se siga viendo igual.
--
-- ── LO QUE ESTA COLUMNA VIENE A IMPEDIR ──────────────────────────────────────
-- Hoy el agente de handoff se resuelve con
--   prisma.agent.findFirst({ where: { agentGroup: "handoff" } })
-- SIN `orderBy` y SIN filtrar `status`. Es determinista POR ACCIDENTE: hay exactamente
-- una fila con ese grupo. El día que se siembre la segunda, Postgres puede devolver
-- cualquiera de las dos y una Implementación de HubSpot se generaría con el prompt de
-- Sitios web — sin ningún error visible, sin log, sin nada. Por eso esta migración va
-- ANTES de sembrar la primera variante, no junto con ella.
--
-- Valores válidos: los `key` de PROJECT_PIPELINES (lib/projects/kind.ts) —
-- 'customer-success' | 'development' | 'web' — o NULL. NO se usa un enum de Postgres a
-- propósito: los pipelines se crean en HubSpot cualquier tarde y un enum no puede
-- guardar uno desconocido ni soltar un valor sin cirugía (mismo criterio que
-- `Project.hubspotPipelineId`). El invariante INV15 valida los valores; el resolver
-- ignora los que no reconoce y cae al genérico.

ALTER TABLE "Agent" ADD COLUMN IF NOT EXISTS "pipelineKey" TEXT;

-- El resolver consulta SIEMPRE por (agentGroup, pipelineKey). Con ~29 filas el índice no
-- cambia nada de rendimiento; está para que el par se pueda inspeccionar barato y para
-- que el día que alguien liste "todos los agentes de este tipo" no haga seq scan.
CREATE INDEX IF NOT EXISTS "Agent_agentGroup_pipelineKey_idx"
  ON "Agent" ("agentGroup", "pipelineKey");

COMMENT ON COLUMN "Agent"."pipelineKey" IS
  'Tipo de proyecto al que aplica este agente (key de PROJECT_PIPELINES). NULL = sirve para todos: es el fallback que conserva intacto el comportamiento de Implementación de HubSpot.';
