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
/**
 * LA ÚNICA FORMA DE ARMAR LA DIRECCIÓN DE UN PROYECTO. Un proyecto no tiene pantalla propia:
 * vive como pestaña dentro de la ficha de su cliente.
 *
 * ⚠ Existió una ruta profunda `/clients/{c}/projects/{p}` que renderizaba el canvas SUELTO, sin
 * pestañas y sin contexto. No estaba rota —era otra pantalla— pero llegar ahí desde un clic en
 * una fila se leía como que el proyecto había perdido todo. Costó veinte minutos de diagnóstico
 * para descubrir que no había nada que diagnosticar. Se retiró; esta función es lo que impide
 * que alguien la reconstruya a mano en la próxima fila clickeable.
 *
 * ⚠ `?canvas=` SIN `?tab=` solo resuelve cuando el cliente tiene exactamente un proyecto
 * navegable. Con dos o más, la pestaña por defecto es «Información del cliente» y el canvas se
 * ignora. Por eso el tab siempre viaja.
 */
/**
 * El `?canvas=` que lleva al resultado de una corrida (2026-09-28). Desde 14b8c920 la URL de un
 * proyecto SIN `canvas` abre el Resumen, así que:
 *  · el handoff vive en el Resumen (no es un documento del desplegable): su enlace va SIN canvas;
 *    con el id de su canvas, el panel no lo encontraba y abría el Cronograma, sin handoff a la vista;
 *  · el cronograma no escribe bloques, así que su corrida no trae canvas: va por el slug `timeline`
 *    (el panel acepta slug), o el aviso de «Listo» dejaba a la persona en el widget.
 */
export function canvasDelResultado(r: {
  canvasId: string | null;
  canvasSlug: string | null;
  agentGroup: string | null;
}): string | null {
  if (r.canvasSlug === "handoff") return null;
  if (r.canvasId) return r.canvasId;
  if (r.agentGroup === "cronograma") return "timeline";
  return null;
}

export function urlDeProyecto(clientId: string, projectId: string, canvasId?: string | null): string {
  const qs = new URLSearchParams({ tab: projectId });
  if (canvasId) qs.set("canvas", canvasId);
  return `/clients/${encodeURIComponent(clientId)}?${qs.toString()}`;
}

export function resolveRunResultUrl(run: RunUrlInput): string {
  if (run.businessCaseId) return `/business-cases/${run.businessCaseId}`;

  if (run.clientId && run.projectId) return urlDeProyecto(run.clientId, run.projectId, run.canvasId);

  if (run.clientId) return `/clients/${run.clientId}`;

  // Sin cliente = reporte de cartera agregada (Cobranza) — el único caso de
  // AgentRun.clientId null hoy (ver el comentario del schema).
  return "/cobranza";
}
