-- ─────────────────────────────────────────────────────────────────────────────
-- Tanda T · Tabla LlmCall — el libro de gasto de IA
--
-- ADITIVA: crea una tabla nueva y no toca ninguna existente. Se puede correr ANTES del deploy
-- sin romper nada (el código viejo la ignora), que es lo que la hace segura.
--
-- ── POR QUÉ TABLA PROPIA Y NO COLUMNAS EN AgentRun ───────────────────────────
-- Hay 26 llamadas a Claude en producción y solo 16 sitios que crean un `AgentRun`. Medir dentro
-- de esa tabla perdería ~40% del gasto. `agentRunId` queda opcional para cruzarlas cuando existe.
--
-- ⛔ SIN claves foráneas, a propósito. Client / Project / AgentRun usan `onDelete: Cascade`: con
-- una FK real, borrar un cliente se llevaría el registro de lo que YA se gastó en él y el total
-- del mes cambiaría hacia atrás. Un libro de gasto no se reescribe.
--
-- ── APLICADA A PRODUCCIÓN el 2026-08-17 ──────────────────────────────────────
-- Verificado: 17 columnas + 4 índices (el pkey y los 3 declarados), y Prisma la lee.
--
-- ── CÓMO SE CORRE ────────────────────────────────────────────────────────────
--   ALLOW_PROD_WRITE=1 npx prisma db execute --file scripts/sql/2026-08-17-llm-call.sql
--   npx prisma generate
-- ⚠ Prisma 7 RECHAZA `--schema` en `db execute` (la URL sale de prisma.config.ts). Los .sql
--   viejos del repo documentan la forma de Prisma 6, que hoy falla con "unknown option".
--   ⚠ y REINICIAR el dev server: sin eso el cliente en memoria queda viejo y las escrituras
--     fallan en silencio (el error apunta a la consulta, no al proceso).
--
-- ⛔ NUNCA `prisma db push`: droppearía columnas de otras tablas (regla dual-PC).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "LlmCall" (
  "id"                  TEXT             NOT NULL,
  "at"                  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "model"               TEXT             NOT NULL,
  "ok"                  BOOLEAN          NOT NULL DEFAULT true,
  "errorType"           TEXT,
  "durationMs"          INTEGER,

  "inputTokens"         INTEGER          NOT NULL DEFAULT 0,
  "outputTokens"        INTEGER          NOT NULL DEFAULT 0,
  "cacheReadTokens"     INTEGER          NOT NULL DEFAULT 0,
  "cacheCreationTokens" INTEGER          NOT NULL DEFAULT 0,
  -- Estimación calculada con lib/ai/precios.ts, no lo facturado. NULL = modelo sin tarifa
  -- conocida (los tokens se midieron igual).
  "costUsd"             DOUBLE PRECISION,

  -- Atribución: toda opcional. Se mide el 100% desde el día uno y se atribuye de a poco.
  -- "triggeredByEmail" vacío = lo disparó el sistema, que es lo que decide el presupuesto.
  "agentSlug"           TEXT,
  "agentRunId"          TEXT,
  "clientId"            TEXT,
  "projectId"           TEXT,
  "triggeredByEmail"    TEXT,
  "origen"              TEXT,

  CONSTRAINT "LlmCall_pkey" PRIMARY KEY ("id")
);

-- Por período (la consulta de "gasto de hoy / semana / mes").
CREATE INDEX IF NOT EXISTS "LlmCall_at_idx" ON "LlmCall"("at");
-- Por agente y período (el desglose de "quién gasta").
CREATE INDEX IF NOT EXISTS "LlmCall_agentSlug_at_idx" ON "LlmCall"("agentSlug", "at");
-- Por persona y período — y también sirve para el presupuesto automático, que se consulta
-- justamente por AUSENCIA de email.
CREATE INDEX IF NOT EXISTS "LlmCall_triggeredByEmail_at_idx" ON "LlmCall"("triggeredByEmail", "at");
