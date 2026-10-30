/**
 * lib/tests-diagnostico/tarjeta-del-radar.ts — DÓNDE VA LA TARJETA de una dimensión del radar en la página del resultado
 * (29 y 30 oct). PURO y CLIENT-SAFE: lo usa components/external/test/AnimacionesDelResultado.tsx con las medidas de la
 * pantalla.
 *
 * La regla: la tarjeta va JUNTO a la dimensión que se está mirando y nunca la tapa (Elías, 30 oct: del lado contrario del
 * radar salía «súper alejado»).
 *   · En pantallas anchas va al costado de afuera del rótulo, a su altura. Si ahí no cabe, arriba del rótulo en la mitad
 *     de arriba del radar y debajo en la de abajo, para no taparle la línea al vértice. En una ventana baja, donde
 *     tampoco cabe, al costado de adentro.
 *   · En pantallas angostas (tablet, teléfono, ventana a media pantalla) el radar es más chico que la tarjeta y cualquier
 *     costado lo tapa: va centrada en la MITAD DE LA PANTALLA donde no está el dedo, con el alto que queda hasta él (y una
 *     franja libre alrededor); lo que no entra se desplaza dentro de la tarjeta.
 * Las pruebas: tarjeta-del-radar.test.ts.
 */

/** Desde este ancho de pantalla, la tarjeta va junto al rótulo; debajo, en la otra mitad. */
export const ANCHO_PARA_IR_AL_COSTADO = 1100;
/** Lo que separa la tarjeta del rótulo. */
export const AIRE = 14;
/** La franja que queda libre arriba y abajo del dedo: lo que mide un rótulo o un número del radar, con aire. */
export const LIBRE = 36;
const BORDE = 8;

export interface Caja {
  left: number;
  right: number;
  top: number;
  bottom: number;
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
  radar: Caja;
  /** El rótulo de la dimensión (sin él, el punto del puntero). */
  rotulo: Caja | null;
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
  const r = o.rotulo ?? { left: o.x, right: o.x, top: o.y, bottom: o.y };
  const aLaDerecha = (r.left + r.right) / 2 >= (o.radar.left + o.radar.right) / 2;
  const alCostado = aLaDerecha ? r.right + AIRE : r.left - AIRE - o.w;
  const cabeAlCostado = alCostado >= BORDE && alCostado + o.w <= o.vw - BORDE;
  const final = (left: number, top: number): PosicionDeLaTarjeta => ({
    left: Math.round(dentro(left, BORDE, o.vw - o.w - BORDE)),
    top: Math.round(dentro(top, BORDE, o.vh - o.h - BORDE)),
    altoMaximo: null,
    angosta: false,
  });
  if (cabeAlCostado) return final(alCostado, (r.top + r.bottom) / 2 - o.h / 2);
  const left = aLaDerecha ? r.left : r.right - o.w;
  const encima = r.top - AIRE - o.h;
  const debajo = r.bottom + AIRE;
  const cabeEncima = encima >= BORDE;
  const cabeDebajo = debajo + o.h <= o.vh - BORDE;
  // En una ventana baja puede no caber ni encima ni debajo: al costado de adentro, sobre el radar, para no tapar el rótulo.
  if (!cabeEncima && !cabeDebajo) return final(aLaDerecha ? r.left - AIRE - o.w : r.right + AIRE, (r.top + r.bottom) / 2 - o.h / 2);
  const prefiereEncima = (r.top + r.bottom) / 2 < (o.radar.top + o.radar.bottom) / 2;
  return final(left, (prefiereEncima ? cabeEncima : !cabeDebajo) ? encima : debajo);
}
