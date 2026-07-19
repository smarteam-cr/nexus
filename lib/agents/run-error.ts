/**
 * lib/agents/run-error.ts — parseo del error humanizado de un AgentRun.
 *
 * Contrato de escritura: cuando un run falla, `markError` (analyze/route.ts)
 * persiste `output = JSON.stringify({ error: humanizeAgentError(e) })`. Este
 * helper es el ÚNICO lector de ese contrato (antes vivía inline en el GET
 * [runId]; el centro de corridas lo necesita también → extraído).
 */

const FALLBACK = "El agente no pudo completar la tarea. Probá de nuevo.";

/** Devuelve la razón humanizada del fallo, o el mensaje genérico si no la hay. */
export function parseRunError(output: string | null | undefined): string {
  try {
    const parsed = JSON.parse(output ?? "{}") as { error?: unknown };
    if (typeof parsed?.error === "string" && parsed.error.trim()) return parsed.error;
  } catch {
    /* output no-JSON (runs viejos o outputs de contenido) */
  }
  return FALLBACK;
}
