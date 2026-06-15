/**
 * lib/agents/catalog.ts
 *
 * Categorización del catálogo de agentes para la página /agents (solo catálogo,
 * no se ejecutan desde acá). Refleja el mapa real de DISPAROS del flujo:
 *
 *   - "canvas"      → se disparan con el CTA "Generar" junto al nombre del canvas
 *                     del proyecto (Handoff, Kickoff, Diagnóstico, Planificación,
 *                     Cronograma) o de la pestaña Procesos (mapeo).
 *   - "session"     → corren solos al sincronizar reuniones de Google Meet.
 *   - "transversal" → alimentan la "Información del cliente" desde sesiones.
 *   - "library"     → construidos pero FUERA del flujo actual (auditoría,
 *                     diagnósticos alternos, planificaciones/preparaciones viejas,
 *                     CANVAS_PROJECT muerto). No tienen disparador en la UI.
 *
 * La pertenencia se decide por id curado + agentGroup + agentType (no por cuid
 * hardcodeado: el handoff se resuelve por agentGroup="handoff").
 */
import { AGENT_GROUP_TO_CANVAS } from "@/lib/canvas/default-canvases";

export type AgentCategoryKey = "canvas" | "session" | "transversal" | "library";

export interface AgentCategoryMeta {
  key: AgentCategoryKey;
  label: string;
  description: string;
}

/** Categorías en orden de presentación. */
export const AGENT_CATEGORIES: AgentCategoryMeta[] = [
  {
    key: "canvas",
    label: "En su canvas (flujo)",
    description:
      "Se disparan con el botón “Generar” anclado al nombre del canvas del proyecto (o la pestaña Procesos).",
  },
  {
    key: "session",
    label: "Sesiones (automático)",
    description:
      "Corren solos al sincronizar reuniones de Google Meet — no se disparan a mano.",
  },
  {
    key: "transversal",
    label: "Transversales",
    description: "Alimentan la “Información del cliente” a partir de las sesiones.",
  },
  {
    key: "library",
    label: "Sin uso / biblioteca",
    description:
      "Construidos pero fuera del flujo actual (auditoría, diagnósticos alternos, preparaciones). Sin disparador en la UI.",
  },
];

/** Agentes del flujo anclados a un canvas, por id (el handoff va por agentGroup). */
const CANVAS_FLOW_IDS = new Set<string>([
  "agent-kickoff-canvas",
  "agent-diagnostico-canvas",
  "agent-planificacion-canvas",
  "agent-mapeo-inicial",
  "agent-timeline-detail",
]);

/** Agentes automáticos de sesión, por id (más cualquier SESSION_PROCESSOR). */
const SESSION_IDS = new Set<string>([
  "agent-post-session",
  "agent-session-project-classifier",
  "agent-participants-analyzer",
  "agent-sales-analysis",
  "agent-service-analysis",
  "agent-session-processor",
]);

export interface CategorizableAgent {
  id: string;
  agentType: string;
  agentGroup?: string | null;
}

export function categorizeAgent(a: CategorizableAgent): AgentCategoryKey {
  if (CANVAS_FLOW_IDS.has(a.id) || a.agentGroup === "handoff") return "canvas";
  if (SESSION_IDS.has(a.id) || a.agentType === "SESSION_PROCESSOR") return "session";
  if (a.agentType === "CANVAS_CLIENT") return "transversal";
  return "library";
}

/** Hint corto de "dónde se dispara" para mostrar en la fila del catálogo. */
export function agentTriggerHint(a: CategorizableAgent): string {
  const cat = categorizeAgent(a);
  if (cat === "canvas") {
    if (a.id === "agent-mapeo-inicial") return "Pestaña Procesos";
    if (a.id === "agent-timeline-detail") return "Canvas Cronograma";
    const canvas = a.agentGroup ? AGENT_GROUP_TO_CANVAS[a.agentGroup] : undefined;
    return canvas ? `Canvas ${canvas}` : "Canvas del proyecto";
  }
  if (cat === "session") return "Automático (Google Meet)";
  if (cat === "transversal") return "Información del cliente";
  return "Sin disparador";
}
