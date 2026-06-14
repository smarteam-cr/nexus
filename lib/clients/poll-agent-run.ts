/**
 * lib/clients/poll-agent-run.ts
 *
 * Polling de una corrida de agente que corre en BACKGROUND. Cuando el POST
 * /api/clients/[id]/analyze responde { runId, status:"RUNNING" } (agentes pesados
 * como CARDS_AND_FLOWCHARTS, o cuando el cliente pidió async), el disparador debe
 * pollear el GET /api/clients/[id]/analyze/[runId] hasta DONE/ERROR.
 *
 * Lo usan los 3 disparadores: AgentPanel (pop-up), SubstepAgentButton y
 * ClientContextCards — para no duplicar el loop.
 */

export interface PolledRun {
  status: "DONE" | "ERROR" | "TIMEOUT";
  id?: string;
  createdAt?: string;
  agentName?: string | null;
  outputType?: string;
  cards?: Array<{ cardType?: string; canvasSection?: string | null; [k: string]: unknown }>;
  flowcharts?: unknown[];
  flowchart?: unknown;
}

export async function pollAgentRun(
  clientId: string,
  runId: string,
  opts?: { intervalMs?: number; maxAttempts?: number },
): Promise<PolledRun> {
  const intervalMs = opts?.intervalMs ?? 3000;
  const maxAttempts = opts?.maxAttempts ?? 120; // ~6 min

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    let rd: Partial<PolledRun> = {};
    try {
      rd = await fetch(`/api/clients/${clientId}/analyze/${runId}`).then((r) => r.json());
    } catch {
      continue; // fallo puntual de red al pollear → reintentar
    }
    if (rd.status === "DONE" || rd.status === "ERROR") {
      return { ...rd, status: rd.status };
    }
    // RUNNING / PENDING → seguir polleando
  }
  return { status: "TIMEOUT" };
}

/** Resumen corto de lo que produjo una corrida (para toasts). */
export function summarizeRun(d: {
  cards?: Array<{ cardType?: string }>;
  flowcharts?: unknown[];
  flowchart?: unknown;
}): string {
  const allCards = d.cards ?? [];
  const textCards = allCards.filter((c) => c.cardType !== "FLOWCHART" && c.cardType !== "CHART");
  const flowchartCount = (d.flowcharts?.length ?? 0) + (d.flowchart ? 1 : 0);
  const parts: string[] = [];
  if (textCards.length > 0) parts.push(`${textCards.length} card${textCards.length !== 1 ? "s" : ""}`);
  if (flowchartCount > 0) parts.push(`${flowchartCount} diagrama${flowchartCount !== 1 ? "s" : ""}`);
  return parts.join(" + ") || "sin resultados";
}
