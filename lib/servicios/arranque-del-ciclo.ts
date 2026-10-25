/**
 * lib/servicios/arranque-del-ciclo.ts — LO QUE TIENE QUE ESTAR ANTES DE TRABAJAR UN CICLO. PURO y CLIENT-SAFE.
 *
 * Sale de Liliana con RC Inmobiliaria (2026-10-23, roadmap M1 y M2): el riel de un SmartLoop mostraba un kickoff de julio
 * que decía «proyecto temporal», y el «Qué sigue» mandaba a escribir el diagnóstico sin una sola sesión de exploración.
 *
 *  · EL KICKOFF ANTERIOR AL SERVICIO (M1 etapa 3): un kickoff con contenido que no se generó con la plantilla del servicio
 *    («Kickoff de servicio recurrente», lib/entregables/registro.ts) es de antes de que el proyecto fuera recurrente: no
 *    cuenta el método por ciclos ni la cadencia. Se avisa «regenéralo»; nunca se regenera solo (la IA cuesta y pisa lo
 *    que el CSE editó).
 *  · LA EXPLORACIÓN DEL CICLO (M2): el ciclo se diagnostica después de explorar con cada equipo del cliente. Cuenta como
 *    exploración del ciclo una reunión que la exploración viva del proyecto ya LEYÓ (`propuesta.lecturas`) desde que
 *    cerró el ciclo anterior; en el primer ciclo, cualquiera. Sin ninguna, el «Qué sigue» propone explorar y el
 *    diagnóstico avisa antes de generarse.
 */

/** Lo que el riel, el «Qué sigue» y el diagnóstico saben del arranque del ciclo. */
export interface ArranqueDelCiclo {
  /** Reuniones de la exploración leídas en este ciclo. */
  lecturasDeExploracion: number;
  /** El kickoff tiene contenido y no es el del servicio. */
  kickoffAnteriorAlServicio: boolean;
}

/** Lo mínimo de una lectura de la exploración (lib/exploraciones/contenido.ts › LecturaDeReunion). */
export interface LecturaParaElCiclo {
  /** Cuándo fue la reunión (ISO), si se sabe. */
  fecha?: string;
  /** Cuándo la leyó el agente (ISO). */
  en: string;
}

/**
 * Cuántas reuniones leyó la exploración en el ciclo: las que ocurrieron (o, sin fecha, se leyeron) desde `desde`. Sin
 * `desde` (el primer ciclo), todas. Una fecha que no se entiende no cuenta.
 */
export function lecturasDelCiclo(lecturas: Readonly<Record<string, LecturaParaElCiclo>>, desde: Date | null): number {
  const corte = desde ? desde.getTime() : null;
  let n = 0;
  for (const l of Object.values(lecturas)) {
    const t = Date.parse(l.fecha || l.en);
    if (Number.isNaN(t)) continue;
    if (corte === null || t >= corte) n++;
  }
  return n;
}

/** ¿El kickoff es anterior al servicio? Solo con contenido: un kickoff vacío se genera, no se regenera. */
export function kickoffAnteriorAlServicio(o: { conContenido: boolean; plantillaId: string | null; plantillaDelServicio: string }): boolean {
  return o.conContenido && o.plantillaId !== o.plantillaDelServicio;
}

export const AVISO_KICKOFF_ANTERIOR = {
  corto: "anterior al servicio",
  largo: "Este kickoff es anterior al servicio: no cuenta cómo se trabaja por ciclos ni la cadencia. Regenéralo.",
} as const;

/** El «Qué sigue» de un ciclo en Diagnóstico sin exploración, y el aviso del diagnóstico. */
export const EXPLORA_PRIMERO =
  "Explora primero, por equipo: prepara la primera sesión de la exploración con un equipo del cliente. El diagnóstico se escribe después.";

/** Lo que dice el aviso del diagnóstico de un recurrente que se genera sin exploración del ciclo. */
export function avisoSinExploracionDelCiclo(numero: number): string {
  return `Es el ciclo ${numero} de un servicio recurrente y su exploración no tiene ninguna reunión leída: el diagnóstico va a salir sin lo que dijo cada equipo del cliente en este ciclo.`;
}
