/**
 * lib/agents/anthropic-error.ts
 *
 * Traduce un error crudo de una corrida de agente (típicamente del SDK de
 * Anthropic) a un mensaje ACCIONABLE en castellano para el CSE. Antes el usuario
 * veía "El agente falló durante la ejecución" sin saber que, p.ej., la cuenta de
 * Anthropic se quedó sin créditos. F2.3.
 *
 * Sin dependencias: lee `status` + `message` del error (el SDK los expone).
 */
export function humanizeAgentError(e: unknown): string {
  const status = (e as { status?: number } | null)?.status;
  const raw = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();

  if (raw.includes("credit balance") || raw.includes("plans & billing")) {
    return "La cuenta de Anthropic no tiene créditos. Avisale a Elías para recargarla.";
  }
  if (status === 401 || raw.includes("authentication") || raw.includes("invalid x-api-key") || raw.includes("invalid api key")) {
    return "La API key de Anthropic es inválida o expiró. Avisale a Elías.";
  }
  if (status === 429 || raw.includes("rate limit")) {
    return "Estamos por encima del límite de la IA por ahora. Probá de nuevo en un minuto.";
  }
  if (status === 529 || raw.includes("overloaded")) {
    return "La IA está sobrecargada en este momento. Probá de nuevo en unos segundos.";
  }
  if (status === 400 && raw.includes("max_tokens")) {
    return "La respuesta de la IA quedó cortada. Probá de nuevo.";
  }
  if (raw.includes("timeout") || raw.includes("etimedout") || raw.includes("econnreset") || raw.includes("network")) {
    return "La IA tardó demasiado o se cortó la conexión. Probá de nuevo.";
  }
  return "El agente no pudo completar la tarea. Probá de nuevo; si persiste, avisá al equipo.";
}
