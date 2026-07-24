/**
 * lib/agents/run-url.ts
 *
 * ¿A qué URL lleva el resultado de una corrida de agente? PURO (sin Prisma ni red):
 * recibe los ids que ya trae `AgentRun` y devuelve el deep-link. Quien consulta la
 * base es el llamador (`runResultUrlInputs` en el feed), así esta decisión —la que
 * define a dónde te manda el aviso de "listo"— se puede testear sola.
 *
 * Por qué existe: hasta ahora TODA notificación y todo ítem del centro de corridas
 * apuntaba a `/clients/{id}` (la home del cliente), y el usuario tenía que buscar a
 * mano en qué pestaña y canvas había quedado lo generado.
 *
 * No inventa esquema: reusa el que ya implementa el workspace —`?tab={projectId}`
 * (app/(shell)/clients/[id]/WorkspaceClient.tsx) y `?canvas={canvasId}`
 * (components/clients/ProjectCanvasPanel.tsx)—.
 */

export interface RunUrlInput {
  clientId: string | null;
  projectId: string | null;
  businessCaseId: string | null;
  /** id del ProjectCanvas donde aterrizó lo generado (vía bloques o cronograma). */
  canvasId: string | null;
}

/**
 * Precedencia de lo MÁS específico a lo más general — siempre devuelve algo
 * navegable (nunca null): un aviso que no lleva a ningún lado es peor que uno
 * que te deja cerca.
 *
 * Nota sobre `?canvas=`: el panel lo omite cuando el canvas es el default
 * (`isDefault`), pero pasarlo igual es inocuo — el panel lo resuelve y lo
 * reescribe. Preferimos ser explícitos: es el destino que el agente escribió.
 */
export function resolveRunResultUrl(run: RunUrlInput): string {
  if (run.businessCaseId) return `/business-cases/${run.businessCaseId}`;

  if (run.clientId && run.projectId) {
    const qs = new URLSearchParams({ tab: run.projectId });
    if (run.canvasId) qs.set("canvas", run.canvasId);
    return `/clients/${run.clientId}?${qs.toString()}`;
  }

  if (run.clientId) return `/clients/${run.clientId}`;

  // Sin cliente = reporte de cartera agregada (Cobranza) — el único caso de
  // AgentRun.clientId null hoy (ver el comentario del schema).
  return "/cobranza";
}
