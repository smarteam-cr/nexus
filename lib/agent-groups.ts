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
    key: "preparacion",
    label: "Preparación",
    description: "Lo que se hace al arrancar con un cliente",
    order: 0,
    icon: "🔍",
  },
  {
    key: "diagnostico",
    label: "Diagnóstico",
    description: "Lo que se hace para entender al cliente",
    order: 1,
    icon: "🔬",
  },
  {
    key: "planificacion",
    label: "Planificación",
    description: "Diseño de la solución y roadmap",
    order: 2,
    icon: "📐",
  },
  {
    key: "ejecucion",
    label: "Ejecución",
    description: "Implementación y configuración",
    order: 3,
    icon: "⚡",
  },
  {
    key: "adopcion",
    label: "Adopción",
    description: "Entrenamiento, piloto y evolución continua",
    order: 4,
    icon: "🚀",
  },
];

export const GROUP_BY_KEY = Object.fromEntries(
  AGENT_GROUPS.map((g) => [g.key, g])
) as Record<string, AgentGroupDef>;

export function getGroupOrder(groupKey: string | null | undefined): number {
  if (!groupKey) return 0;
  return GROUP_BY_KEY[groupKey]?.order ?? 0;
}
