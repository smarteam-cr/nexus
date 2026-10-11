/**
 * lib/canvas/merge-pending-items.ts — los pendientes que devolvía un agente de /analyze. YA NO CREA NADA.
 *
 * DEPRECATED — memoria de la cuenta, etapa 2 (2026-10-10; DECISIONS «La lectura de cada reunión es durable…»):
 * `ActionItem` se retiró y este era su tercer escritor (además del post-proceso y de la ruta /api/action-items). Los
 * próximos pasos viven en Tareas y nacen de la lectura de cada reunión, por el único escritor de Tareas. /analyze no
 * puede escribir tareas (está en los PROHIBIDOS de lib/tareas/guardas.test.ts), así que acá no se crea nada: lo que
 * devolvió el agente queda en `AgentRun.output`, como cualquier otra salida, y se cuenta como salteado.
 *
 * La firma se queda para no tocar a quien llama (app/api/clients/[id]/analyze/route.ts, en dos lugares). Borrar
 * este archivo (y esas dos llamadas) cuando ningún agente de /analyze pida `pendingItems`: el formato común ya no lo
 * pide (lib/canvas/agent-output-schema.ts).
 */

export interface NewPendingItem {
  text: string;
  source?: string;
}

export interface MergeResult {
  added: number;
  skipped: number;
  total: number;
}

/** No crea nada: cuenta lo que llegó como salteado y lo deja en el log. */
export async function mergePendingItemsToProject(
  projectId: string | null | undefined,
  newItems: NewPendingItem[] | undefined | null,
): Promise<MergeResult> {
  const recibidos = (newItems ?? []).filter((it) => (it?.text ?? "").trim()).length;
  if (projectId && recibidos > 0) {
    console.log(
      `[merge-pending-items] project=${projectId} pendientes=${recibidos}: no se crean (ActionItem se retiró; los próximos pasos son tareas). Quedan en AgentRun.output.`,
    );
  }
  return { added: 0, skipped: recibidos, total: 0 };
}
