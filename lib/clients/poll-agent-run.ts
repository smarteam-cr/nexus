/**
 * lib/clients/poll-agent-run.ts
 *
 * Polling de una corrida de agente que corre en BACKGROUND. Cuando el POST
 * /api/clients/[id]/analyze responde { runId, status:"RUNNING" } (agentes pesados
 * como CARDS_AND_FLOWCHARTS, o cuando el cliente pidió async), el disparador debe
 * pollear el GET /api/clients/[id]/analyze/[runId] hasta DONE/ERROR.
 *
 * Lo usan los disparadores de agentes: CanvasAgentButton (CTA por-canvas),
 * SubstepAgentButton y ClientContextCards — para no duplicar el loop.
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
  blocks?: unknown[];
  /** Razón real del fallo (la expone el GET [runId] cuando status=ERROR). F2. */
  error?: string;
  /** Fase en curso ("Analizando sesiones…") — la expone el GET cuando RUNNING. F3. */
  currentPhase?: string | null;
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

/**
 * Traduce el resultado del polling a un toast (tipo + mensaje). Centraliza la
 * lógica que antes vivía inline en cada disparador (F2.2):
 *   DONE    → success con resumen de lo generado
 *   ERROR   → la razón REAL (créditos / key / rate limit …), no "el agente falló"
 *   TIMEOUT → mensaje honesto: sigue corriendo, revisá en unos minutos
 */
export function summarizePollResult(r: PolledRun): { type: "success" | "error"; message: string } {
  if (r.status === "DONE") return { type: "success", message: `Listo — ${summarizeRun(r)}` };
  if (r.status === "ERROR") {
    return { type: "error", message: r.error || "El agente no pudo completar la tarea. Probá de nuevo." };
  }
  // TIMEOUT: el polling se rindió pero el agente puede seguir corriendo.
  return {
    type: "error",
    message: "El agente se está demorando más de lo esperado. Revisá el resultado en unos minutos.",
  };
}

/** Resumen corto de lo que produjo una corrida (para toasts). */
export function summarizeRun(d: {
  cards?: Array<{ cardType?: string }>;
  flowcharts?: unknown[];
  flowchart?: unknown;
  blocks?: unknown[];
}): string {
  const allCards = d.cards ?? [];
  const textCards = allCards.filter((c) => c.cardType !== "FLOWCHART" && c.cardType !== "CHART");
  const flowchartCount = (d.flowcharts?.length ?? 0) + (d.flowchart ? 1 : 0);
  // Agentes en block-format (Kickoff, Handoff, Diagnóstico) devuelven `blocks`, no `cards`.
  // Sin contarlos, el toast decía "sin resultados" aunque hubiera generado bloques.
  const blockCount = d.blocks?.length ?? 0;
  const parts: string[] = [];
  if (textCards.length > 0) parts.push(`${textCards.length} card${textCards.length !== 1 ? "s" : ""}`);
  if (blockCount > 0) parts.push(`${blockCount} bloque${blockCount !== 1 ? "s" : ""}`);
  if (flowchartCount > 0) parts.push(`${flowchartCount} diagrama${flowchartCount !== 1 ? "s" : ""}`);
  return parts.join(" + ") || "sin resultados";
}
