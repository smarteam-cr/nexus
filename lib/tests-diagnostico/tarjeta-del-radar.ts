/**
 * lib/tests-diagnostico/tarjeta-del-radar.ts — DÓNDE VA LA TARJETA de una dimensión del radar en la página del resultado
 * (29 oct). PURO y CLIENT-SAFE: lo usa components/external/test/AnimacionesDelResultado.tsx con las medidas de la pantalla.
 *
 * La regla: la tarjeta nunca tapa la dimensión que se está mirando.
 *   · En pantallas anchas el radar ocupa todo el ancho y al costado no queda lugar (en la vieja, sí): va dentro del radar,
 *     del LADO CONTRARIO a la dimensión, a la altura del puntero.
 *   · En pantallas angostas (tablet, teléfono, ventana a media pantalla) el radar es más chico que la tarjeta y cualquier
 *     costado lo tapa (revisión del 29 oct): va centrada en la MITAD DE LA PANTALLA donde no está el dedo, con el alto que
 *     queda hasta él (y una franja libre alrededor); lo que no entra se desplaza dentro de la tarjeta.
 * Las pruebas: tarjeta-del-radar.test.ts.
 */

/** Desde este ancho de pantalla, la tarjeta va al costado; debajo, en la otra mitad. */
export const ANCHO_PARA_IR_AL_COSTADO = 1100;
const AIRE = 18;
/** La franja que queda libre arriba y abajo del dedo: lo que mide un rótulo o un número del radar, con aire. */
export const LIBRE = 36;
const BORDE = 8;

export interface CajaDelRadar {
  left: number;
  right: number;
}

export interface PosicionDeLaTarjeta {
  left: number;
  top: number;
  /** El alto máximo (solo en pantallas angostas), o null. */
  altoMaximo: number | null;
  /** En la otra mitad de la pantalla: se puede tocar para desplazarla. */
  angosta: boolean;
}

export function posicionDeLaTarjeta(o: {
  /** El tamaño de la pantalla. */
  vw: number;
  vh: number;
  /** El tamaño de la tarjeta. */
  w: number;
  h: number;
  /** Dónde está el puntero (o el centro del elemento con el foco). */
  x: number;
  y: number;
  radar: CajaDelRadar;
  /** El centro horizontal del rótulo de la dimensión. */
  xDeLaDimension: number;
}): PosicionDeLaTarjeta {
  const dentro = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  if (o.vw < ANCHO_PARA_IR_AL_COSTADO) {
    // Del lado con más lugar, dejando libre una franja alrededor del dedo (el rótulo o número que tocó).
    const arriba = o.y >= o.vh / 2;
    const altoMaximo = Math.floor(arriba ? o.y - LIBRE - BORDE : o.vh - o.y - LIBRE - BORDE);
    const h = Math.min(o.h, altoMaximo);
    return {
      left: Math.round(dentro((o.vw - o.w) / 2, BORDE, o.vw - o.w - BORDE)),
      top: Math.round(arriba ? BORDE : o.vh - h - BORDE),
      altoMaximo,
      angosta: true,
    };
  }
  const aLaDerecha = o.xDeLaDimension >= (o.radar.left + o.radar.right) / 2;
  const left = aLaDerecha ? o.radar.left + AIRE : o.radar.right - o.w - AIRE;
  return {
    left: Math.round(dentro(left, BORDE, o.vw - o.w - BORDE)),
    top: Math.round(dentro(o.y - o.h / 2, BORDE, o.vh - o.h - BORDE)),
    altoMaximo: null,
    angosta: false,
  };
}
