/**
 * lib/nexus-chat/constantes.ts — lo que comparten el servidor y la pantalla del chat de Nexus (2026-10-17, ficha H de
 * docs/roadmap-detalle.md; fase 4 de docs/nexus-sistema-de-trabajo-plan.md). CLIENT-SAFE, puro.
 */

/**
 * La pieza del hilo. ⛔ No es un canvas ni un documento: el hilo cuelga de la CUENTA (`Dueno` { clientId }) y va por su
 * propia ruta (`/api/nexus-chat/[clientId]/asistente`). Ninguna ruta de documento la acepta.
 */
export const PIEZA_NEXUS = "nexus";

/**
 * Abrir el chat de la cuenta desde otra parte de la pantalla (la guía de una exploración: «Mejorar con el asistente»,
 * validación 71). Se manda como evento del navegador para no atar la guía al cajón; lo escucha components/nexus-chat.
 */
export const EVENTO_ABRIR_EL_CHAT = "nexus-chat:abrir";

export interface PedidoDeAbrirElChat {
  /** Lo que se señala: la guía de una exploración (`id` = la exploración). */
  chip?: { tipo: "guia"; id: string; etiqueta: string };
  /** Llena el campo sin mandarlo. */
  texto?: string;
  /**
   * Pedidos listos para mandar, en botones arriba del campo (con el chip de la guía: los arma la guía real, sin IA, en
   * lib/exploraciones/sugerencias-del-asistente.ts). Un clic llena el campo; no lo manda.
   */
  sugerencias?: string[];
}

/** Abre el chat de la cuenta (si está montado en la pantalla). */
export function abrirElChatDeNexus(p: PedidoDeAbrirElChat): void {
  window.dispatchEvent(new CustomEvent<PedidoDeAbrirElChat>(EVENTO_ABRIR_EL_CHAT, { detail: p }));
}

/** El agente, para verlo aparte en /integrations/gasto-ia. Cada turno deja su `AgentRun` con este slug. */
export const SLUG_DEL_CHAT_DE_NEXUS = "nexus-chat";

/**
 * Cuánto piensa el modelo en cada llamada del chat (validación 106, medido el 2026-10-18 con Distribuidora Larce y
 * scripts/medir-turno-de-la-guia.ts). Con el de siempre (`high`), «¿Qué otras preguntas agregarías?» tardó 34 s: 28 s
 * eran la primera llamada pensando (2.659 tokens de salida para dos preguntas). Un chat contesta corto; lo que tiene que
 * cumplir una pregunta de la guía (tuteo, largo, no repetir lo sabido) lo revisa el código al preparar, no el modelo.
 */
export const ESFUERZO_DEL_CHAT = "low" as const;

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
