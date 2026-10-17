/**
 * lib/nexus-chat/constantes.ts — lo que comparten el servidor y la pantalla del chat de Nexus (2026-10-17, ficha H de
 * docs/roadmap-detalle.md; fase 4 de docs/nexus-sistema-de-trabajo-plan.md). CLIENT-SAFE, puro.
 */

/**
 * La pieza del hilo. ⛔ No es un canvas ni un documento: el hilo cuelga de la CUENTA (`Dueno` { clientId }) y va por su
 * propia ruta (`/api/nexus-chat/[clientId]/asistente`). Ninguna ruta de documento la acepta.
 */
export const PIEZA_NEXUS = "nexus";

/** El agente, para verlo aparte en /integrations/gasto-ia. Cada turno deja su `AgentRun` con este slug. */
export const SLUG_DEL_CHAT_DE_NEXUS = "nexus-chat";

/** Los topes (decisión 7 del plan: «tope por persona y por vueltas, y el costo de cada hilo»). */
export const TOPES_DEL_CHAT = {
  /** Mensajes de una persona por día, en TODAS sus cuentas. */
  mensajesPorDia: 40,
  /** Dólares de una persona por día en el chat de Nexus, en todas sus cuentas. Pasado el tope, espera a mañana. */
  usdPorDia: 3,
  /** Llamadas al modelo dentro de un mismo turno (cada lectura con herramientas es una vuelta). La última va sin herramientas. */
  vueltasPorTurno: 6,
  /** Cambios propuestos en una misma lista. */
  cambiosPorLista: 15,
  /** Turnos del hilo que se le mandan al modelo. */
  turnosALaVista: 12,
} as const;

/** El prefijo del `origen` de cada llamada: `nexus-chat:<hiloId>`. Así se suma el costo de un hilo sin otra columna. */
export const PREFIJO_DEL_ORIGEN = "nexus-chat:";

export function origenDelHilo(hiloId: string): string {
  return `${PREFIJO_DEL_ORIGEN}${hiloId}`;
}

/** Dólares en una frase corta: «US$0,12». */
export function usd(n: number): string {
  return `US$${n.toFixed(2).replace(".", ",")}`;
}
