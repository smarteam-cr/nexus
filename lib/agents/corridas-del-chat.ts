/**
 * lib/agents/corridas-del-chat.ts — LAS CORRIDAS DEL CHAT «NEXUS» NO SON AGENTES QUE SE ESPERAN (25 nov, Elías probando
 * TEC · AE). Client-safe (solo tipos de Prisma).
 *
 * Cada mensaje al chat deja una o dos corridas (`AgentRun`: la vuelta, la respuesta que lee la cuenta, un pedido a La
 * escala, la revisión de si una nota cambia La escala), y el vigilante de corridas de la app
 * (components/ai/AgentRunsProvider.tsx, por /api/agent-runs) avisaba de cada una abajo a la derecha: «Listo: Nexus responde
 * sobre la cuenta de TEC · AE · Ver», «Listo: Hablar con Nexus de TEC · AE · Ver». La persona ya veía la respuesta en el
 * chat, y «Ver» llevaba a la ficha del cliente. Esas corridas salen del vigilante: la respuesta se ve en el chat y, con el
 * cajón cerrado, el botón «Nexus» lleva un punto rojo hasta que se abre (lib/exploraciones/abrir-nexus.ts). Tampoco ocupan
 * los 15 lugares de «lo último» del indicador de corridas, que es para los agentes que de verdad se esperan.
 *
 * Cuáles son:
 *   · las del chat de la preventa (lib/chat-de-nexus/conversacion-server.ts): comparten el agente de la exploración con
 *     agentes de verdad (Ubicar, el Resumen), así que se reconocen por su rótulo (`ETIQUETAS_DEL_CHAT`, que usa ese archivo);
 *   · las del chat de la cuenta en la ficha (`nexus-chat`) y las de «✨ Mejorar con IA» de La escala (`pedirle-a-nexus`);
 *   · la revisión de si una nota cambia La escala (lib/impacto/impacto-server.ts): su resultado es la cuenta regresiva del
 *     chat, que la persona ve ahí.
 * Los chats de los documentos, del cronograma y de Tareas no dejan corridas (solo su gasto): no hace falta nombrarlos.
 */
import type { Prisma } from "@prisma/client";

/** Los rótulos de las corridas del chat de la preventa (`stepLabel`). Los usa el servidor del chat al crearlas. */
export const ETIQUETAS_DEL_CHAT = {
  vuelta: "Hablar con Nexus",
  respuesta: "Nexus responde sobre la cuenta",
} as const;

/** Los agentes que solo corren dentro de un chat: el de la cuenta (lib/nexus-chat) y el de La escala. */
export const AGENTES_DEL_CHAT = ["nexus-chat", "pedirle-a-nexus"] as const;

/** Cómo empieza el rótulo de la revisión de si una nota cambia un documento (lib/impacto/impacto-server.ts). */
export const PREFIJO_DEL_IMPACTO = "¿La nota cambia ";

/**
 * El filtro que deja afuera las corridas del chat. Una columna vacía (sin agente, sin rótulo) no es del chat: el `OR` con
 * null lo cuida (en SQL, `NOT IN` con un null deja la fila afuera).
 */
export function sinLasDelChat(): Prisma.AgentRunWhereInput {
  return {
    AND: [
      { OR: [{ agentSlug: null }, { agentSlug: { notIn: [...AGENTES_DEL_CHAT] } }] },
      { OR: [{ stepLabel: null }, { AND: [{ stepLabel: { notIn: Object.values(ETIQUETAS_DEL_CHAT) } }, { NOT: { stepLabel: { startsWith: PREFIJO_DEL_IMPACTO } } }] }] },
    ],
  };
}

/** Lo mismo, para una corrida ya leída (las pruebas y quien filtre en memoria). */
export function esDelChat(r: { agentSlug: string | null; stepLabel: string | null }): boolean {
  if (r.agentSlug && (AGENTES_DEL_CHAT as readonly string[]).includes(r.agentSlug)) return true;
  if (!r.stepLabel) return false;
  return (Object.values(ETIQUETAS_DEL_CHAT) as string[]).includes(r.stepLabel) || r.stepLabel.startsWith(PREFIJO_DEL_IMPACTO);
}
