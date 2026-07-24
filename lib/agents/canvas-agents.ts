/**
 * lib/agents/canvas-agents.ts
 *
 * Mapa curado canvas → agente PRIMARIO, para el CTA "Generar" junto al nombre del canvas
 * (reemplaza el pop-up de agentes). Solo los canvas del flujo cuyo agente se dispara desde
 * el workspace. Handoff y Cronograma NO están acá — tienen su propio CTA dedicado
 * (ProjectHandoffSection / CronogramaCanvas). Procesos se dispara desde ClientProcesosPanel.
 */
export interface CanvasAgentDef {
  agentId: string;
  /** Texto del botón. */
  label: string;
  /** true para agentes pesados (CARDS_AND_FLOWCHARTS) → run detached + polling. */
  async?: boolean;
}

export const CANVAS_PRIMARY_AGENT: Record<string, CanvasAgentDef> = {
  Kickoff: { agentId: "agent-kickoff-canvas", label: "Generar kickoff" },
  "Diagnóstico": { agentId: "agent-diagnostico-canvas", label: "Generar diagnóstico" },
  "Planificación": { agentId: "agent-planificacion-canvas", label: "Generar planificación" },
  // Exploración (guía INTERNA de descubrimiento): se dispara desde el header de su
  // canvas igual que el kickoff. `async` porque el runner corre detached (lee handoff +
  // historial + canvases y escribe 6 secciones — no entra en una request corta).
  "Exploración": { agentId: "agent-exploracion-canvas", label: "Generar exploración", async: true },
};
