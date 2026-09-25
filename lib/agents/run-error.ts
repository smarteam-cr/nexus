/**
 * lib/agents/run-error.ts — parseo del error humanizado de un AgentRun.
 *
 * Contrato de escritura: cuando un run falla, `markError` (analyze/route.ts)
 * persiste `output = JSON.stringify({ error: humanizeAgentError(e) })`. Este
 * helper es el ÚNICO lector de ese contrato (antes vivía inline en el GET
 * [runId]; el centro de corridas lo necesita también → extraído).
 * Un fallo que RETORNA (4xx/5xx) lo escribe `markDone` con `motivoDeLaRespuesta`.
 */

const FALLBACK = "El agente no pudo completar la tarea. Prueba de nuevo.";

/**
 * Qué se guarda como `error` de la corrida cuando la ruta RESPONDE un fallo `{ error, message }`:
 * el TEXTO (`message`) si lo hay, y el código solo si no hay texto. Revisión de E2a: se guardaba el
 * código («CLAUDE_ERROR», «PROPUESTA_CAMBIO»…) y el CSE lo leía tal cual en el toast, en el centro
 * de corridas y en la línea de las tareas. null = nada legible (queda el genérico).
 */
export function motivoDeLaRespuesta(body: unknown): string | null {
  const b = (body && typeof body === "object" ? body : {}) as { error?: unknown; message?: unknown };
  for (const v of [b.message, b.error]) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

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
