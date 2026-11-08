/**
 * lib/analizador-venta/conversacion.ts — QUÉ PARTE DE LA REUNIÓN LEE EL ANALIZADOR (2026-11-08). PURO.
 *
 * Antes se cortaba por el final: con un tope de 90 mil letras, la reunión de Centauro del 6 nov (92 mil) perdió sus últimos
 * 33 turnos, que eran justo el cierre: ahí se movió la sesión de Marketing del martes al miércoles a las 2 con Catalina y
 * se agendó la del lunes a las 9 con Luis. El análisis dijo «el martes con Fernando» porque no vio el resto.
 *
 * Ahora el tope es más alto (una reunión de dos horas larga entra entera) y, si igual no entra, se omite un pedazo del
 * MEDIO: el arranque (con quién se habla, para qué) y el cierre (los acuerdos, los próximos pasos) llegan siempre. Los
 * turnos conservan su número de la conversación entera, así una cita se ubica igual.
 */
import { comprimirConversacion, type Turno } from "@/lib/sessions/conversacion";

/** Unas dos horas y media de reunión. Arriba de esto, se omite un pedazo del medio. */
export const TOPE_DE_LA_CONVERSACION = 120_000;
/** Cuánto del tope se guarda para el cierre cuando hay que omitir el medio. */
const PARTE_DEL_CIERRE = 0.25;

export interface ConversacionDelAnalisis {
  turnos: Turno[];
  /** Se omitió un pedazo del medio (entre `omitidos.desde` y `omitidos.hasta`, números de turno). */
  omitidos: { desde: number; hasta: number } | null;
}

const largo = (t: Turno) => t.hablante.length + t.texto.length + 4;

export function conversacionDelAnalisis(transcript: string, tope = TOPE_DE_LA_CONVERSACION): ConversacionDelAnalisis {
  const { turnos } = comprimirConversacion(transcript, Number.POSITIVE_INFINITY);
  const total = turnos.reduce((s, t) => s + largo(t), 0);
  if (total <= tope) return { turnos, omitidos: null };

  const paraElCierre = Math.floor(tope * PARTE_DEL_CIERRE);
  const cierre: Turno[] = [];
  let usados = 0;
  for (let i = turnos.length - 1; i >= 0 && usados + largo(turnos[i]) <= paraElCierre; i--) {
    cierre.unshift(turnos[i]);
    usados += largo(turnos[i]);
  }
  const arranque: Turno[] = [];
  const hastaDelArranque = turnos.length - cierre.length;
  for (let i = 0; i < hastaDelArranque && usados + largo(turnos[i]) <= tope; i++) {
    arranque.push(turnos[i]);
    usados += largo(turnos[i]);
  }
  const desde = (arranque[arranque.length - 1]?.n ?? 0) + 1;
  const hasta = (cierre[0]?.n ?? turnos.length + 1) - 1;
  return { turnos: [...arranque, ...cierre], omitidos: hasta >= desde ? { desde, hasta } : null };
}
