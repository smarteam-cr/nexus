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

/* ── El puente del cursor (8 nov, Elías probando La escala de Centauro Solutions: «al mover el cursor hacia la tarjeta,
   desaparece»). La tarjeta se deja alcanzar en las dos pantallas y en cualquier ancho: lo mueve
   components/escala/movimiento-del-radar.ts, con estas reglas.
   · Al salir de la dimensión rumbo a la tarjeta, espera `GRACIA_PARA_LLEGAR_MS`; al salir en otra dirección, se cierra
     de una (nunca queda pegada al dejar el radar). Al salir de la tarjeta espera `GRACIA_AL_SALIR_MS`.
   · El camino no cambia de dimensión: lo que es de todo el eje (la porción, la línea, el rótulo, el número) no cambia la
     tarjeta de ese mismo eje (con áreas superpuestas, el nodo de Marketing y su rótulo comparten eje). Otra dimensión
     solo cambia la tarjeta de una vez si el cursor no va rumbo a ella; si va, la cambia si se detiene ahí
     `ESPERA_AL_CRUZAR_MS`. Así nada invisible tapa otra dimensión: pasar por ella con calma la abre. ── */

/** Lo que espera la tarjeta a que llegue el cursor, cuando sale de la dimensión rumbo a ella. */
export const GRACIA_PARA_LLEGAR_MS = 350;
/** Lo que espera al salir el cursor de la tarjeta antes de cerrarse (un borde, un temblor de la mano). */
export const GRACIA_AL_SALIR_MS = 200;
/** Rumbo a la tarjeta, lo que el cursor tiene que quedarse en otra dimensión para que la tarjeta cambie a ella. */
export const ESPERA_AL_CRUZAR_MS = 160;

export interface Punto {
  x: number;
  y: number;
}

/** La distancia de un punto a una caja (0 si está adentro). */
export function distanciaALaCaja(p: Punto, c: Caja): number {
  const dx = Math.max(c.left - p.x, 0, p.x - c.right);
  const dy = Math.max(c.top - p.y, 0, p.y - c.bottom);
  return Math.hypot(dx, dy);
}

/** Si el cursor, de `antes` a `ahora`, se acerca a la tarjeta. */
export function vaHaciaLaTarjeta(antes: Punto | null, ahora: Punto | null, tarjeta: Caja | null): boolean {
  if (!antes || !ahora || !tarjeta) return false;
  return distanciaALaCaja(ahora, tarjeta) < distanciaALaCaja(antes, tarjeta) - 0.5;
}

/** Una pieza del radar bajo el cursor: su dimensión, el eje donde está y si es de todo el eje (porción, línea, rótulo, número). */
export interface PiezaDelRadar {
  clave: string;
  eje: string;
  deEje: boolean;
}

/**
 * Qué hace la tarjeta cuando el cursor entra a una pieza del radar, con la que está abierta (la de otro radar cuenta como
 * ninguna): `abrir` esa dimensión ya, `esperar` a ver si se queda ahí, o `nada`.
 */
export function alEntrarEnUnaPieza(abierta: { clave: string; eje: string } | null, pieza: PiezaDelRadar, rumboALaTarjeta: boolean): "abrir" | "esperar" | "nada" {
  if (!abierta) return "abrir";
  if (abierta.clave === pieza.clave) return "nada";
  if (pieza.deEje && pieza.eje === abierta.eje) return "nada";
  return rumboALaTarjeta ? "esperar" : "abrir";
}
