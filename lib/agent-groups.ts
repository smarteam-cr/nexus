// ─── Grupos temáticos de agentes ──────────────────────────────────────────────
// Reemplazan el concepto de Stage 1/2/3 + Step 0/1/2 para la UI.
// El chaining usa groupOrder: agentes con groupOrder menor pasan contexto a los mayores.

export interface AgentGroupDef {
  key: string;
  label: string;
  description: string;
  order: number;
  icon: string; // emoji
}

export const AGENT_GROUPS: AgentGroupDef[] = [
  {
    key: "handoff",
    label: "Handoff",
    description: "Traspaso de Ventas a CS al cerrar un deal",
    order: 0,
    icon: "🤝",
  },
  {
    key: "kickoff",
    label: "Kickoff",
    description: "Landing de arranque para el cliente (a partir del handoff curado)",
    order: 0.5,
    icon: "🏁",
  },
  {
    key: "cronograma",
    label: "Cronograma",
    description: "Detalle del cronograma: tareas por semana sobre las fases existentes",
    order: 0.75,
    icon: "📅",
  },
  {
    key: "preparacion",
    label: "Preparación",
    description: "Lo que se hace al arrancar con un cliente",
    order: 1,
    icon: "🔍",
  },
  {
    key: "diagnostico",
    label: "Diagnóstico",
    description: "Lo que se hace para entender al cliente",
    order: 2,
    icon: "🔬",
  },
  {
    key: "planificacion",
    label: "Planificación",
    description: "Diseño de la solución y roadmap",
    order: 3,
    icon: "📐",
  },
  {
    key: "roles",
    label: "Roles",
    description: "Assist de los perfiles de puesto del equipo (propone; el humano aplica)",
    order: 4,
    icon: "🧑‍💼",
  },
];

export const GROUP_BY_KEY = Object.fromEntries(
  AGENT_GROUPS.map((g) => [g.key, g])
) as Record<string, AgentGroupDef>;

export function getGroupOrder(groupKey: string | null | undefined): number {
  if (!groupKey) return 0;
  return GROUP_BY_KEY[groupKey]?.order ?? 0;
}
