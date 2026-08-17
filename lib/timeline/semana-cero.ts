/**
 * lib/timeline/semana-cero.ts — ¿HAY QUE ANTEPONER una "Semana 0" al cronograma del agente?
 *
 * ── EL BUG QUE ESTO ARREGLA (Tanda G, 2026-08-08) ────────────────────────────
 * `persistTimelineFromAgentOutput` anteponía la fase "Semana 0" INCONDICIONALMENTE cuando la
 * primera fase del agente no parecía un arranque. El invariante «todo cronograma arranca con
 * Kickoff» es de la implementación de Customer Success — pero los agentes de handoff por tipo
 * (PROMPT_DEV, PROMPT_WEB) la PROHÍBEN explícitamente: un desarrollo arranca por relevamiento
 * técnico, no por alineación y adopción. Anteponerla en la persistencia deshacía en silencio lo
 * que el prompt pidió en la generación: sin error, sin log, y con el cronograma del hermano
 * menor mostrando la Semana 0 del hub que el usuario pidió no ver.
 *
 * ── POR QUÉ LA REGLA SE DERIVA DE `AGENTES_HANDOFF_POR_TIPO` ─────────────────
 * No se hardcodea `key === "development" || key === "web"`: la tabla de agentes por tipo ES la
 * declaración de «este pipeline tiene voz de handoff propia», y la prohibición de la Semana 0
 * vive literalmente en esos prompts. El día que nazca un tercer agente por tipo, hereda la regla
 * con cero ediciones acá — y el test de acople lo afirma.
 *
 * PURA a propósito: la decisión se puede escribir entera como una tabla en el test, sin base.
 */
import { resolvePipeline } from "@/lib/projects/kind";
import { AGENTES_HANDOFF_POR_TIPO } from "@/lib/agents/handoff-por-tipo";

/**
 * Movido TAL CUAL de `analyze/route.ts` — la única fuente de «esta fase ya es un arranque».
 * Si el regex y la decisión vivieran en lugares distintos, podrían divergir en silencio.
 */
export const PRIMERA_FASE_ES_ARRANQUE = /semana\s*0|semana\s*cero|kick.?off|arranque/i;

/**
 * PURA. `true` = anteponer la fase "Semana 0" (conducta histórica de Customer Success y del
 * pipeline desconocido/legacy). `false` = respetar las fases tal como las propuso el agente.
 */
export function tieneVozDeHandoffPropia(hubspotPipelineId: string | null): boolean {
  const key = resolvePipeline(hubspotPipelineId)?.key ?? null;
  return !!key && AGENTES_HANDOFF_POR_TIPO.some((a) => a.pipelineKey === key);
}

export function debeAnteponerSemanaCero(
  hubspotPipelineId: string | null,
  primeraFase: string | null | undefined,
): boolean {
  // Pipeline con agente de handoff PROPIO → su prompt decide las fases; nunca se le antepone.
  if (tieneVozDeHandoffPropia(hubspotPipelineId)) return false;
  return !PRIMERA_FASE_ES_ARRANQUE.test(primeraFase ?? "");
}
