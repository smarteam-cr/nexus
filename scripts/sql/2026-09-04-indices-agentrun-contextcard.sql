-- 2026-09-04 · Los índices que faltaban: AgentRun, ClientContextCard, FirefliesSession (C-06)
--
-- ── POR QUÉ ─────────────────────────────────────────────────────────────────────
-- Auditoría 2026-09-03: cinco consultas calientes recorren la tabla entera porque el índice
-- que necesitan no existe (los que hay cubren OTRA pregunta):
--   · AgentRun (status, updatedAt): el feed de corridas y el cierre de colgadas filtran por
--     status y ordenan por updatedAt; `@@index([status])` no ordena y el planner vuelve a leer.
--   · AgentRun (projectId, createdAt): el historial de corridas por proyecto. El compuesto que
--     existe es por clientId; por projectId no hay ninguno.
--   · AgentRun GIN (sourceSessionIds): «¿qué corridas usaron esta sesión?» es un array-contains;
--     sin GIN es un seq scan cada vez.
--   · ClientContextCard (projectId, canvasId, canvasSection): la lectura del canvas de un
--     proyecto por sección. Los índices sueltos por canvasId y por canvasSection no cubren el trío.
--   · FirefliesSession GIN (participants): filtros por participante (candidatas internas,
--     «¿en qué reuniones estuvo X?») — array-contains, misma historia.
--
-- ⚠ SIN `CONCURRENTLY`, a propósito: `prisma db execute` corre dentro de una transacción y
-- CONCURRENTLY no puede vivir ahí. Con el tamaño de hoy (~1.600 AgentRun, ~6.400 sesiones) el
-- bloqueo dura segundos; revisar si las tablas pasan de ~100k filas.
-- `IF NOT EXISTS`: re-aplicar es inocuo. Los nombres siguen la convención de Prisma
-- (`Modelo_col1_col2_idx`) para que el espejo en schema.prisma sea el MISMO índice y no otro.
--
-- ── DESPUÉS DE APLICAR (Elías) ────────────────────────────────────────────────────
-- Espejar en prisma/schema.prisma y correr `npx prisma generate`; si no se espejan, el próximo
-- `db push` de la otra PC los dropea (RUNBOOK inv. #2). Las líneas exactas, por modelo:
--   model AgentRun:
--     @@index([status, updatedAt])
--     @@index([projectId, createdAt])
--     @@index([sourceSessionIds], type: Gin)
--   model ClientContextCard:
--     @@index([projectId, canvasId, canvasSection])
--   model FirefliesSession:
--     @@index([participants], type: Gin)
--
-- Aplicar (desde una PC, contra el host DIRECTO, nunca el pooler 6543):
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-09-04-indices-agentrun-contextcard.sql --schema prisma/schema.prisma

CREATE INDEX IF NOT EXISTS "AgentRun_status_updatedAt_idx"
  ON "AgentRun" ("status", "updatedAt");

CREATE INDEX IF NOT EXISTS "AgentRun_projectId_createdAt_idx"
  ON "AgentRun" ("projectId", "createdAt");

CREATE INDEX IF NOT EXISTS "AgentRun_sourceSessionIds_idx"
  ON "AgentRun" USING GIN ("sourceSessionIds");

CREATE INDEX IF NOT EXISTS "ClientContextCard_projectId_canvasId_canvasSection_idx"
  ON "ClientContextCard" ("projectId", "canvasId", "canvasSection");

CREATE INDEX IF NOT EXISTS "FirefliesSession_participants_idx"
  ON "FirefliesSession" USING GIN ("participants");
