/**
 * lib/exploraciones/abrir-nexus.ts — UNA SOLA PUERTA «Nexus» en la preventa (etapa 2 del plan maestro de «Hablar con
 * Nexus», 23 nov). PURO y client-safe: los eventos del navegador con que cualquier parte de la preventa abre el cajón.
 *
 * El botón «Nexus» de arriba y «✨ Mejorar con IA» de La escala no conocen el cajón (components/exploraciones/
 * HablarConNexus.tsx): lo abren con `abrirNexusEnLaPreventa`, y el cajón lo escucha. Con `escala`, el cajón abre con el
 * lugar puesto como chip (el Resumen o un área, y la sección desde la que se pidió): lo que se escribe es un pedido de
 * cambio a la página, y la propuesta por pieza se ve adentro. Con `guia` (24 nov, una sola conversación: «Mejorar con IA»
 * de la guía), abre la MISMA conversación con la guía como chip y sus sugerencias: lo que se escribe es un pedido sobre la
 * guía, que prepara el chat de la cuenta con la guía a la vista. Con `pregunta` (24 nov, «Responder con Nexus» de «Para
 * completar el diagnóstico» en La escala), abre la MISMA conversación con esa pregunta, su equipo y su parte como chip: lo
 * primero que escribe la persona sale con «Sobre <equipo> · <parte> (…): » adelante (completar-el-diagnostico.ts) y,
 * guardado, queda como nota de «Lo que sabes del cliente». Sin chip, es la conversación de siempre.
 */
import type { PreguntaParaResponder } from "./completar-el-diagnostico";
import type { LugarEnLaEscala } from "./escala-con-nexus";

export const EVENTO_ABRIR_NEXUS = "nexus:abrir-en-la-preventa";

/** El lugar de La escala desde el que se pidió, como chip del cajón. */
export interface LugarDeLaEscalaEnElCajon {
  lugar: LugarEnLaEscala;
  /** «Resumen» o el nombre del área. */
  nombre: string;
  /**
   * La SECCIÓN desde la que se pidió (24 nov: el botón del encabezado de cada sección; antes era una pieza), con su nombre
   * de lib/external/secciones-de-la-escala.ts. null: la página entera.
   */
  foco: string | null;
}

/** La guía de la próxima sesión, como chip de la conversación (24 nov). */
export interface GuiaEnElCajon {
  /** «la guía de la sesión 2». */
  etiqueta: string;
  /** Pedidos listos para mandar, en botones sobre la caja (los arma la guía real, sin IA). Un clic llena la caja. */
  sugerencias: string[];
}

export interface PedidoDeAbrirNexus {
  /**
   * La exploración cuyo cajón se abre. En la ficha del cliente pueden quedar cargadas dos (la de la cuenta y la de un
   * proyecto, oculta): sin esto, se abrían los dos cajones y lo pedido iba a la que no se estaba mirando.
   */
  exploracionId: string;
  escala?: LugarDeLaEscalaEnElCajon;
  guia?: GuiaEnElCajon;
  /** Una pregunta de La escala que la persona responde (24 nov): la conversación, con la pregunta como chip. */
  pregunta?: PreguntaParaResponder;
}

export function abrirNexusEnLaPreventa(p: PedidoDeAbrirNexus): void {
  window.dispatchEvent(new CustomEvent<PedidoDeAbrirNexus>(EVENTO_ABRIR_NEXUS, { detail: p }));
}

/** Lo dispara el cajón al aplicar o deshacer un cambio de La escala: la página se vuelve a pedir. */
export const EVENTO_LA_ESCALA_CAMBIO_CON_NEXUS = "nexus:la-escala-cambio";

export function avisarQueNexusCambioLaEscala(): void {
  window.dispatchEvent(new Event(EVENTO_LA_ESCALA_CAMBIO_CON_NEXUS));
}
