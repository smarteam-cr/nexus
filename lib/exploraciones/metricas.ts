/**
 * lib/exploraciones/metricas.ts — cómo sabemos si la exploración sirve. PURO.
 *
 * Se mide con la foto de «lista para proponer» que guarda cada propuesta al armarse desde el lienzo
 * (contenido.alProponer): es lo que tenía la exploración en el momento de proponer, no lo que se
 * completó después.
 *   · Principal: propuestas de primera venta que salen con al menos una meta del cliente en cifras.
 *     Antes no se podía medir; el objetivo propuesto es 8 de cada 10.
 *   · De proceso: las que llegaron con los siete puntos de «lista para proponer», y las que tenían
 *     el siguiente paso con fecha.
 *   · Las propuestas a prospectos que salieron SIN exploración se cuentan aparte: no se pueden medir.
 * Como toda medición de la escala: sirve para mejorar el proceso, nunca para evaluar a quien vende.
 */
import type { FotoAlProponer } from "./contenido";

/** La ventana de la métrica. */
export const DIAS_DE_LA_METRICA = 90;

/** El objetivo de la métrica principal: 8 de cada 10. */
export const OBJETIVO_CON_META = 0.8;

export interface Metricas {
  /** Propuestas armadas desde una exploración en la ventana. */
  propuestas: number;
  conMeta: number;
  listas: number;
  conSiguientePaso: number;
  /** Propuestas a prospectos que salieron sin exploración (no se pueden medir). */
  sinExploracion: number;
}

/**
 * Las fotos de la ventana, una por propuesta (si una propuesta se armó dos veces, cuenta la
 * última). `existen` deja afuera las de propuestas que ya se borraron.
 */
export function calcularMetricas(
  fotos: readonly FotoAlProponer[],
  o: { ahora: Date; existen: ReadonlySet<string>; sinExploracion: number },
): Metricas {
  const desde = o.ahora.getTime() - DIAS_DE_LA_METRICA * 24 * 60 * 60 * 1000;
  const porPropuesta = new Map<string, FotoAlProponer>();
  for (const f of fotos) {
    const en = Date.parse(f.en);
    if (!Number.isFinite(en) || en < desde || en > o.ahora.getTime() || !o.existen.has(f.businessCaseId)) continue;
    const previa = porPropuesta.get(f.businessCaseId);
    if (!previa || Date.parse(previa.en) < en) porPropuesta.set(f.businessCaseId, f);
  }
  const validas = [...porPropuesta.values()];
  const cumple = (f: FotoAlProponer, punto: string) => f.puntos[punto] === true;
  return {
    propuestas: validas.length,
    conMeta: validas.filter((f) => cumple(f, "meta")).length,
    listas: validas.filter((f) => Object.keys(f.puntos).length > 0 && Object.values(f.puntos).every(Boolean)).length,
    conSiguientePaso: validas.filter((f) => cumple(f, "siguientePaso")).length,
    sinExploracion: o.sinExploracion,
  };
}
