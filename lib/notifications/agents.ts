/**
 * lib/notifications/agents.ts
 *
 * Config CENTRAL de "qué agente dispara notificación al terminar" + su etiqueta para
 * el copy. Es la palanca de escalabilidad: un futuro toggle por-usuario (tabla de prefs)
 * leerá este mapa. Default `notifiable: true` para grupos desconocidos → un agente o
 * canvas NUEVO queda cubierto sin tocar este archivo.
 *
 * Client-safe (sin imports de server). Las etiquetas van en TUTEO / lenguaje del copy.
 */

export interface AgentNotifyMeta {
  /** Sustantivo amigable para el mensaje: "handoff", "caso de negocio", "cronograma". */
  label: string;
  /** ¿Se dispara la notificación al completar? (gate para el futuro toggle por-usuario). */
  notifiable: boolean;
}

// Keyed por `Agent.agentGroup` (ver lib/agent-groups.ts). Los agentes largos del onboarding
// + Ventas notifican; los rápidos (avance/assist del cronograma) no llaman a notify.
const BY_GROUP: Record<string, AgentNotifyMeta> = {
  handoff: { label: "handoff", notifiable: true },
  kickoff: { label: "kickoff", notifiable: true },
  cronograma: { label: "cronograma", notifiable: true },
  preparacion: { label: "documento de procesos", notifiable: true },
  diagnostico: { label: "diagnóstico", notifiable: true },
  planificacion: { label: "planificación", notifiable: true },
  "business-case": { label: "caso de negocio", notifiable: true },
  "marketing-contenido": { label: "ideas de contenido", notifiable: true },
  "cs-watchdog": { label: "alerta de éxito del cliente", notifiable: true },
};

const DEFAULT_META: AgentNotifyMeta = { label: "documento", notifiable: true };

/** Meta de notificación para un grupo de agente (o el default si no está mapeado). */
export function notifyMetaForGroup(group: string | null | undefined): AgentNotifyMeta {
  if (!group) return DEFAULT_META;
  return BY_GROUP[group] ?? DEFAULT_META;
}
