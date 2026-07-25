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

/** Indexado por SLUG de pieza (lib/pieces/registry), no por nombre visible: el CTA
 *  "Generar" no puede desaparecer porque alguien renombre el canvas. */
export const CANVAS_PRIMARY_AGENT: Record<string, CanvasAgentDef> = {
  kickoff: { agentId: "agent-kickoff-canvas", label: "Generar kickoff" },
  // async: el runner lee escala + handoff + exploración + procesos y escribe 8
  // secciones — corre detached y la corrida se ve en el centro de corridas.
  diagnosis: { agentId: "agent-diagnostico-canvas", label: "Generar diagnóstico", async: true },
  planning: { agentId: "agent-planificacion-canvas", label: "Generar planificación", async: true },
  // Exploración (guía INTERNA de descubrimiento): se dispara desde el header de su
  // canvas igual que el kickoff. `async` porque el runner corre detached (lee handoff +
  // historial + canvases y escribe 6 secciones — no entra en una request corta).
  exploration: { agentId: "agent-exploracion-canvas", label: "Generar exploración", async: true },
  implementation: { agentId: "agent-implementacion-canvas", label: "Generar implementación", async: true },
};
