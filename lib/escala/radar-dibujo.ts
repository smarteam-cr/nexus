/**
 * lib/escala/radar-dibujo.ts — la geometría del radar de la teoría (components/escala/Radar.tsx). PURO: sin React ni
 * colores.
 *
 * El Mapa en forma de radar (diseño aprobado por Elías el 2026-10-28, pantallas `Teoria`, `TeoriaDimension` y
 * `TeoriaCruce` del lienzo del radar): un eje por dimensión y un anillo por etapa, de Deficiente (adentro) a Óptimo
 * (afuera). En cada cruce de eje y anillo va la celda del Mapa con su cuenta. El centro es un círculo con el nombre del
 * área; los ejes salen de su borde. Las medidas son las del diseño.
 *
 * Grados de reloj: 0 = arriba, en el sentido de las agujas. La base operativa ocupa la mitad derecha y la producción la
 * izquierda; cada eje va por el medio de su tramo, así que ninguno queda vertical (con cuatro por mitad: 22,5° + 45°·k).
 * Arriba, en el hueco entre las dos mitades, van los nombres de las etapas; abajo, el chip de «La base».
 */
import type { ClaveDeCapa } from "./documento/tipos";
import { partirEnLineas } from "./rueda";

// ── Medidas (unidades del viewBox) ────────────────────────────────────────────
export const W = 1000;
export const H = 690;
export const CX = 500;
export const CY = 380;
/** El círculo del centro, con el nombre del área. */
export const R_CENTRO = 88;
/** Los ejes: del borde del centro hasta un poco pasado el último anillo. */
export const R_EJE_DESDE = 96;
export const R_EJE_HASTA = 248;
/** El anillo de la primera etapa (Deficiente) y la distancia entre dos anillos. */
export const R_PRIMER_ANILLO = 110;
export const PASO = 32.5;
/** Dónde va el rótulo de cada dimensión. */
export const R_ETIQUETA = 268;

/** Los cruces: el de siempre, el de la dimensión en foco y el elegido (con su halo). Una celda en 0 es un punto. */
export const CRUCE = 8.5;
export const CRUCE_EN_FOCO = 10.5;
export const CRUCE_ELEGIDO = 12.5;
export const HALO = 16;
export const PUNTO_EN_CERO = 3.5;

/** El número de «qué se trabaja primero»: su radio y el aire que lo separa del número de la dimensión. */
export const R_ORDEN = 8;
const AIRE_DEL_ORDEN = 9;

export const f = (v: number) => v.toFixed(1);
const aRadianes = (g: number) => (g * Math.PI) / 180;

/** Grados de reloj y radio → coordenadas del SVG (la y crece hacia abajo). */
export function polar(grados: number, r: number): [number, number] {
  return [CX + r * Math.sin(aRadianes(grados)), CY - r * Math.cos(aRadianes(grados))];
}

/** El radio del anillo de una etapa (k = 0 es Deficiente). */
export const radioDeLaEtapa = (k: number) => R_PRIMER_ANILLO + PASO * k;

/**
 * El ángulo del eje de cada dimensión: la base operativa reparte la mitad derecha y la producción la izquierda, y cada
 * eje va por el medio de su tramo (con cuatro por mitad, 22,5° + 45°·k). En el orden en que vienen.
 */
export function angulosDeLosEjes(dims: readonly { id: string; capa: ClaveDeCapa }[]): Map<string, number> {
  const out = new Map<string, number>();
  const inicio: Record<ClaveDeCapa, number> = { base: 0, produccion: 180 };
  for (const clave of Object.keys(inicio) as ClaveDeCapa[]) {
    const deLaCapa = dims.filter((d) => d.capa === clave);
    const paso = 180 / Math.max(1, deLaCapa.length);
    deLaCapa.forEach((d, j) => out.set(d.id, inicio[clave] + paso * (j + 0.5)));
  }
  return out;
}

/** El cruce de un eje con el anillo de una etapa. */
export const cruce = (grados: number, k: number) => polar(grados, radioDeLaEtapa(k));

/** El anillo de una etapa: el polígono con un vértice en cada eje. */
export function anilloDeLaEtapa(angulos: readonly number[], k: number): [number, number][] {
  return [...angulos].sort((a, b) => a - b).map((g) => cruce(g, k));
}

/** Los puntos de un polígono, para el atributo `points`. */
export const puntosSvg = (ps: readonly [number, number][]) => ps.map((p) => `${f(p[0])},${f(p[1])}`).join(" ");

/**
 * Dónde cruza un anillo la vertical del centro, arriba o abajo: ahí van los nombres de las etapas y el chip de «La
 * base». Es el lado que une el último eje de una mitad con el primero de la otra; si no hay lado que cruce (un área con
 * todas sus dimensiones en una mitad), el radio a secas.
 */
export function yEnElCentro(angulos: readonly number[], radio: number, lado: "arriba" | "abajo"): number {
  const derecha = angulos.filter((g) => g < 180);
  const izquierda = angulos.filter((g) => g >= 180);
  if (!derecha.length || !izquierda.length) return lado === "arriba" ? CY - radio : CY + radio;
  // Arriba: del último eje de la izquierda al primero de la derecha. Abajo: del último de la derecha al primero de la izquierda.
  const [px, py] = polar(lado === "arriba" ? Math.max(...izquierda) : Math.max(...derecha), radio);
  const [qx, qy] = polar(lado === "arriba" ? Math.min(...derecha) : Math.min(...izquierda), radio);
  const t = (CX - px) / (qx - px);
  return py + (qy - py) * t;
}

/** El nombre de cada etapa, en el hueco de arriba: 10,5 px, y su línea base un poco por debajo del anillo. */
export const LETRA_DE_ETAPA = 10.5;
export const yDelNombreDeEtapa = (angulos: readonly number[], k: number) => yEnElCentro(angulos, radioDeLaEtapa(k), "arriba") + 3.8;

/** El chip de «La base», abajo, centrado sobre el anillo de Funcional (k = 2). */
export const CHIP_DE_LA_BASE = { ancho: 64, alto: 22 };
export function cajaDelChipDeLaBase(angulos: readonly number[]): Caja {
  const y = yEnElCentro(angulos, radioDeLaEtapa(2), "abajo");
  return { x0: CX - CHIP_DE_LA_BASE.ancho / 2, x1: CX + CHIP_DE_LA_BASE.ancho / 2, y0: y - CHIP_DE_LA_BASE.alto / 2, y1: y + CHIP_DE_LA_BASE.alto / 2 };
}

// ── Los rótulos ───────────────────────────────────────────────────────────────

/** Un nombre de dimensión va en renglones de hasta 22 letras («Tecnología y / Automatización»). */
const LETRAS_POR_RENGLON = 22;
export const RENGLON = 18;

/**
 * El rótulo de una dimensión, afuera de su eje: arriba su número (con sus reportes), abajo su nombre y, si va, una nota.
 * Arriba el bloque crece hacia arriba, abajo hacia abajo y a los costados empieza un poco por encima del eje. A la
 * derecha se ancla al comienzo y a la izquierda al final.
 */
export function rotuloDelEje(grados: number, nombre: string, conNota = false) {
  const [x, y] = polar(grados, R_ETIQUETA);
  const s = Math.sin(aRadianes(grados));
  const c = Math.cos(aRadianes(grados));
  const ancla: "start" | "end" = s >= 0 ? "start" : "end";
  const lineas = partirEnLineas(nombre, LETRAS_POR_RENGLON);
  const alto = (lineas.length + (conNota ? 1 : 0)) * RENGLON;
  // La línea base del número.
  const yNumero = c > 0.5 ? y - alto : c < -0.5 ? y + 6 : y - 22;
  return {
    x,
    ancla,
    yNumero,
    nombre: lineas.map((texto, j) => ({ texto, y: yNumero + RENGLON * (j + 1) })),
    yNota: yNumero + RENGLON * (lineas.length + 1) - 2,
  };
}

/**
 * Cuánto mide el número de una dimensión («1.5 · 1 reporte»: 11 px, semibold, con 0,06 em entre letras), estimado. El
 * componente lo mide de verdad cuando puede; esto es lo de antes de medir y lo que usan las pruebas.
 */
export function anchoDelNumero(texto: string): number {
  let ancho = 0;
  for (const letra of texto) ancho += (/[.,·:\s]/.test(letra) ? 3.4 : 6.9) + 0.66;
  return ancho;
}

/**
 * Dónde va el número de «qué se trabaja primero»: junto al número de la dimensión, del lado de afuera (pasado su final),
 * nunca hacia el radar, donde taparía un cruce (Elías, 2026-10-28). Devuelve el centro del círculo.
 */
export function lugarDelOrden(rotulo: { x: number; ancla: "start" | "end"; yNumero: number }, anchoNumero: number): [number, number] {
  const lado = rotulo.ancla === "start" ? 1 : -1;
  return [rotulo.x + lado * (anchoNumero + AIRE_DEL_ORDEN + R_ORDEN), rotulo.yNumero - 4];
}

/** Una caja: de x0 a x1 y de y0 (arriba) a y1 (abajo). */
export interface Caja {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Lo que ocupa el rótulo de una dimensión: su número (y el de «qué se trabaja primero», si va), su nombre y su nota. Con
 * anchos estimados (15 px semibold ≈ 8,2 por letra; 12 px ≈ 6,4).
 */
export function cajaDelRotulo(r: ReturnType<typeof rotuloDelEje>, numero: string, conOrden: boolean, conNota: boolean): Caja {
  const anchoNumero = anchoDelNumero(numero) + (conOrden ? AIRE_DEL_ORDEN + R_ORDEN * 2 : 0);
  const ancho = Math.max(anchoNumero, ...r.nombre.map((l) => l.texto.length * 8.2), conNota ? "no aplica a este perfil".length * 6.4 : 0);
  const abajo = conNota ? r.yNota + 4 : r.nombre[r.nombre.length - 1].y + 4;
  const arriba = Math.min(r.yNumero - 11, conOrden ? r.yNumero - 4 - R_ORDEN : Infinity);
  return r.ancla === "start" ? { x0: r.x, x1: r.x + ancho, y0: arriba, y1: abajo } : { x0: r.x - ancho, x1: r.x, y0: arriba, y1: abajo };
}

/**
 * El nombre de una mitad al costado («BASE OPERATIVA» y su descripción), en renglones de 10 y de 26 letras, centrado a la
 * altura del centro del radar.
 */
export function rotuloDeLaMitad(clave: ClaveDeCapa, nombre: string, descripcion: string | null) {
  const derecha = clave === "base";
  const lineas = partirEnLineas(nombre.toUpperCase(), 10);
  const lineasDeDescripcion = descripcion ? partirEnLineas(descripcion, 26) : [];
  const alto = (lineas.length - 1) * 32 + (lineasDeDescripcion.length ? 24 + (lineasDeDescripcion.length - 1) * 17 : 0);
  const y0 = CY + 24.5 - alto / 2;
  return {
    x: derecha ? 800 : 200,
    ancla: (derecha ? "start" : "end") as "start" | "end",
    nombre: lineas.map((texto, j) => ({ texto, y: y0 + j * 32 })),
    descripcion: lineasDeDescripcion.map((texto, j) => ({ texto, y: y0 + (lineas.length - 1) * 32 + 24 + j * 17 })),
  };
}

/** La porción de un eje donde se apunta: del centro al borde, hasta la mitad del camino a cada eje vecino. */
export function porcionDelEje(angulos: readonly number[], grados: number): [number, number][] {
  const orden = [...angulos].sort((a, b) => a - b);
  const i = orden.indexOf(grados);
  if (i < 0 || orden.length < 2) return [];
  const antes = i === 0 ? orden[orden.length - 1] - 360 : orden[i - 1];
  const despues = i === orden.length - 1 ? orden[0] + 360 : orden[i + 1];
  const [g0, g1] = [(antes + grados) / 2, (grados + despues) / 2];
  // Un poco más allá del último anillo, para que tocar cerca de Óptimo también cuente.
  const r = R_EJE_HASTA + 12;
  return [[CX, CY], polar(g0, r), polar(grados, r), polar(g1, r)];
}
