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
  // async desde 2026-07-25: en proyectos con mucho contexto tardaba minutos con el
  // botón colgado (y el fetch moría a los ~3 min como "Error de conexión"). Detached
  // gana además la visibilidad en el centro de corridas — mismo código, otro wrapper.
  kickoff: { agentId: "agent-kickoff-canvas", label: "Generar kickoff", async: true },
  // async: el runner lee escala + handoff + exploración + procesos y escribe 8
  // secciones — corre detached y la corrida se ve en el centro de corridas.
  diagnosis: { agentId: "agent-diagnostico-canvas", label: "Generar diagnóstico", async: true },
  planning: { agentId: "agent-planificacion-canvas", label: "Generar planificación", async: true },
  // Exploración (guía INTERNA de descubrimiento): se dispara desde el header de su
  // canvas igual que el kickoff. `async` porque el runner corre detached (lee handoff +
  // historial + canvases y escribe 6 secciones — no entra en una request corta).
  exploration: { agentId: "agent-exploracion-canvas", label: "Generar exploración", async: true },
  implementation: { agentId: "agent-implementacion-canvas", label: "Generar implementación", async: true },
  /* Entrega: el documento de cierre. `async` como los demás — el runner lee handoff,
     kickoff, requerimiento técnico, procesos y las últimas 12 reuniones con transcripción,
     y escribe 9 secciones. No entra en una request corta. */
  delivery: { agentId: "agent-entrega-canvas", label: "Generar entrega", async: true },
  /* Desarrollo (tech-requirements) NO está acá, y es a propósito: su botón necesita estado
     que solo el workspace tiene —si la auto-generación posterior al handoff sigue en curso,
     `busy` evita la doble corrida— así que se inyecta al header por PORTAL, igual que el
     Cronograma. En pantalla queda en el mismo lugar: junto al nombre. */
};
