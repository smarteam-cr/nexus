/**
 * lib/exploraciones/objeciones-comunes.ts — el manual de bolsillo para manejar objeciones. PURO.
 *
 * Pedido de Elías (2026-10-01): al lado del título de la exploración, un botón que explique cómo
 * manejar objeciones con LAER y traiga las más comunes. Las cuatro típicas son las MISMAS de la guía
 * (`OBJECIONES_DE_BASE`): no se escriben dos veces. Acá se suman las otras que aparecen seguido en
 * una venta consultiva. La guía de la próxima reunión trae las de cada empresa, adaptadas.
 */
import type { ClaseDeObjecion } from "./casillas";
import { OBJECION, OBJECIONES_DE_BASE, PASOS_LAER, type PasoLaer } from "./guia";

/** Qué es cada paso de LAER y una frase para decirlo. */
export const QUE_ES_CADA_PASO: Record<PasoLaer, { que: string; ejemplo: string }> = {
  escuchar: {
    que: "Deja que termine sin interrumpir ni defenderte. La objeción casi nunca es la primera frase: es lo que viene después.",
    ejemplo: "«Cuéntame más.»",
  },
  reconocer: {
    que: "Muestra que lo entendiste, sin darle la razón ni discutir. Baja la tensión y te da permiso para preguntar.",
    ejemplo: "«Tiene sentido que lo pienses así.»",
  },
  explorar: {
    que: "Pregunta hasta llegar a lo que hay detrás: el último caso real, la causa, cuánto le cuesta. Muchas objeciones se resuelven solas aquí.",
    ejemplo: "«¿Comparado con qué? ¿Qué pasaría si no lo resuelven este año?»",
  },
  responder: {
    que: "Recién ahora responde, y con lo que te dijo: su meta en cifras, lo que le cuesta quedarse igual. Cierra con un paso concreto.",
    ejemplo: "«Entonces, si llegar a 35 cierres vale más que esto, ¿lo revisamos con quien decide el martes?»",
  },
};

export interface ObjecionComun {
  clase: ClaseDeObjecion;
  /** Lo que dice el cliente, entre comillas latinas. */
  dice: string;
  escuchar: string;
  reconocer: string;
  explorar: string;
  responder: string;
}

const OTRAS: readonly ObjecionComun[] = [
  {
    clase: "confianza",
    dice: "«Ya trabajamos con una consultora y no salió bien»",
    escuchar: "Pregunta qué pasó, con quién y en qué quedó. No hables mal de nadie.",
    reconocer: "Es lógico que cueste volver a confiar después de eso.",
    explorar: "¿Qué esperaban y qué recibieron? ¿Qué tendría que pasar distinto esta vez?",
    responder: "Propón empezar por algo chico y medible, atado a su meta, para que lo vean funcionar antes de comprometerse a más.",
  },
  {
    clase: "decisor",
    dice: "«Lo tengo que consultar»",
    escuchar: "Pregunta con quién y qué le van a preguntar.",
    reconocer: "Claro, una decisión así no la toma una sola persona.",
    explorar: "¿Qué le importa a esa persona? ¿Qué necesitaría ver para decir que sí?",
    responder: "Ofrece una reunión corta con quien decide, para contarle su meta y lo que cuesta no llegar, en sus números.",
  },
  {
    clase: "interno",
    dice: "«Eso lo podemos hacer nosotros»",
    escuchar: "Pregunta quién lo haría y cuánto tiempo le pueden dedicar.",
    reconocer: "Tienen gente capaz; eso ayuda mucho.",
    explorar: "¿Lo intentaron antes? ¿Qué quedó a medias? ¿Qué deja de hacer esa persona mientras tanto?",
    responder: "Compara contra su meta y su plazo: cuánto tardarían solos contra cuánto les cuesta cada mes sin resolverlo.",
  },
];

/** Las objeciones más comunes: las cuatro de la guía y las otras que aparecen seguido. */
export const OBJECIONES_COMUNES: readonly ObjecionComun[] = [
  ...OBJECIONES_DE_BASE.map((o) => ({
    clase: o.tipo,
    dice: OBJECION[o.tipo],
    escuchar: o.escuchar,
    reconocer: o.reconocer,
    explorar: o.explorar,
    responder: o.responder,
  })),
  ...OTRAS,
];

export { PASOS_LAER };
