/**
 * lib/timeline/phase-signal.ts — TODO LO QUE HAY QUE SABER DE UNA FASE, EN UN INDICADOR. PURO.
 *
 * ── EL PROBLEMA ──────────────────────────────────────────────────────────────
 * Cada fila de fase del Gantt cargaba once elementos, y **cuatro de ellos no hacían nada al
 * clickearlos**: el chip de estado, el chip de tipo de actividad, el badge "Estimada" y un
 * punto rojo. Cuatro cajitas de solo lectura compitiendo con los controles reales —el nombre,
 * la duración, las semanas— en un renglón.
 *
 * Y el punto rojo había dejado de señalar. Su criterio era *"alguna tarea suya venció"*, que
 * en Wherex dispara en **7 de 10 fases**. Cuando algo marca casi todo, deja de marcar: el ojo
 * lo filtra y las tres fases que sí están mal se pierden entre las siete que no.
 *
 * ── LA DISTINCIÓN QUE FALTABA ────────────────────────────────────────────────
 * Una tarea vencida dentro de una fase EN CURSO y una fase cuya ventana de calendario YA
 * TERMINÓ y sigue abierta no son la misma noticia. La primera es un problema de tarea —y ya
 * lo grita su propia fila al expandir, y el panel de pendientes de arriba—. La segunda es un
 * problema del PLAN: el calendario se corrió y nadie lo movió.
 *
 * Solo la segunda va en rojo. La distinción no se inventa acá: la hace `derivePhaseState`,
 * el módulo que ya separa el estado guardado del estado real.
 *
 * ── EL TIPO DE ACTIVIDAD PASA A SER EL COLOR ─────────────────────────────────
 * "Configuración" escrito en un chip ocupa un renglón para repetir lo que la barra de esa
 * misma fila ya dice con su color. El nombre vive en la leyenda —que es donde se aprende la
 * clave— y en el tooltip, que es donde se consulta.
 */
import { derivePhaseState, type PhaseStateInput, type PhaseStateContext } from "./phase-state";

export type SignalTone = "ok" | "curso" | "riesgo" | "neutro";

export interface PhaseSignal {
  /** El texto compacto que se ve en la fila. "" = la fase no tiene nada que declarar. */
  texto: string;
  tono: SignalTone;
  /** La lectura completa, para el `title`. Nada de lo que se comprime se pierde: se consulta. */
  detalle: string;
  /** La ventana de la fase terminó y sigue abierta. Es lo único que va en rojo. */
  atrasada: boolean;
  /** Tareas suyas vencidas y sin resolver, hoy. */
  vencidas: number;
}

export interface PhaseSignalInput extends PhaseStateInput {
  /** Nombre legible del tipo de actividad ("Configuración"). null = la fase no tiene tipo. */
  tipoLabel?: string | null;
  /** El agente estimó la duración sin datos de tiempos en ventas. */
  needsValidation?: boolean;
  /** Cuántas de sus tareas están vencidas y sin resolver (predicado único: `isOverdueByDate`). */
  vencidas: number;
}

const ESTADO_LABEL: Record<string, string> = {
  DONE: "Completada",
  IN_PROGRESS: "En curso",
};

/** Frase larga para el tooltip — cada pieza dicha entera, sin abreviar. */
const ESTADO_DETALLE: Record<string, string> = {
  DONE: "completada",
  IN_PROGRESS: "en curso",
  PENDING: "sin empezar",
  SUSPENDED: "suspendida",
};

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

export function buildPhaseSignal(p: PhaseSignalInput, ctx: PhaseStateContext): PhaseSignal {
  const { divergences } = derivePhaseState(p, ctx);
  const vencidas = Math.max(p.vencidas, 0);

  /* ── SIN TAREAS NO SE PUEDE DECIR QUE ESTÁ ATRASADA ─────────────────────────
     Una fase vacía cuya ventana cerró no dice "nadie la hizo": dice "nadie la escribió".
     No hay forma de distinguir las dos cosas, y llamarla atrasada elige la peor sin
     evidencia. La medición sobre la cartera real lo puso en números: de las 55 fases que
     el criterio nuevo marcaba, **19 no tenían una sola tarea** — todas dentro de los 17
     cronogramas (de 32) que nunca se detallaron. Con la compuerta quedan 36, por debajo de
     las 45 que marcaba el criterio viejo, y cada una con su número al lado.
     Que un cronograma no tenga detalle SÍ es un pendiente, pero es de otro dueño: la
     acción `detalle-sin-confirmar` del panel y el punto ámbar del desplegable de piezas. */
  const atrasada = (p.tasks ?? []).length > 0 && divergences.includes("VENTANA_CERRADA_SIN_CERRAR");

  const partes: string[] = [];
  if (atrasada) {
    /* Cuando la ventana cerró, todo lo que quede abierto está pasado de fecha por definición.
       "sin hacer" y no "vencidas": el problema ya no es cuándo vencieron sino que la fase
       entera se quedó sin calendario. */
    partes.push("Atrasada");
    if (vencidas > 0) partes.push(plural(vencidas, "sin hacer", "sin hacer"));
  } else {
    /* PENDING no se dice: es el estado de la mayoría de las filas y no informa nada. Decirlo
       gastaba el mismo espacio que los estados que sí son noticia. */
    const estado = ESTADO_LABEL[p.status];
    if (estado) partes.push(estado);
    if (vencidas > 0) partes.push(plural(vencidas, "vencida", "vencidas"));
  }
  if (p.needsValidation) partes.push("estimada");

  const tono: SignalTone = atrasada
    ? "riesgo"
    : p.status === "DONE"
      ? "ok"
      : p.status === "IN_PROGRESS"
        ? "curso"
        : "neutro";

  return {
    texto: partes.join(" · "),
    tono,
    detalle: buildDetalle(p, atrasada, vencidas),
    atrasada,
    vencidas,
  };
}

function buildDetalle(p: PhaseSignalInput, atrasada: boolean, vencidas: number): string {
  const partes: string[] = [];
  if (p.tipoLabel) partes.push(p.tipoLabel);
  else partes.push("Sin tipo de actividad");
  partes.push(ESTADO_DETALLE[p.status] ?? p.status.toLowerCase());
  if (atrasada) partes.push("su ventana de calendario ya terminó y sigue abierta");
  if (vencidas > 0) partes.push(plural(vencidas, "tarea vencida", "tareas vencidas"));
  if (p.needsValidation) {
    partes.push("duración estimada por la IA, sin datos de tiempos en ventas: confirmala");
  }
  return partes.join(" · ");
}
