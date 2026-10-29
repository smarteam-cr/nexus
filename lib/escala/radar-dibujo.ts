/**
 * lib/escala/radar-dibujo.ts — la geometría del Radar de la escala (components/escala/Radar.tsx). PURO: sin React ni
 * colores.
 *
 * Un radar clásico (Elías, 2026-10-28, al rechazar la versión sobre la rueda del mapa: «no es un radar de verdad»): un eje
 * por dimensión, una regla de 0 (el centro) a 100 (el borde) con anillos poligonales en los límites de cada franja, y
 * cada serie como un polígono con sus vértices sobre los ejes. Sin zonas de color por nivel. Las medidas son las del
 * diseño aprobado en Claude Design (pantallas `Main` y `Dimension` del lienzo del radar).
 *
 * La regla es la del cálculo de la escala (docs/escala/especificacion_calculo_escala.md, pasos 6 y 7 del diagnóstico):
 * Deficiente 0–19, Inicial 20–39, Funcional 40–59, Eficiente 60–79 y Óptimo 100. «La base» es el anillo de 40, donde
 * empieza Funcional.
 *
 * Grados de reloj: 0 = arriba, en el sentido de las agujas. La base operativa ocupa la mitad derecha y la producción la
 * izquierda; cada eje va por el medio de su tramo, así que ninguno queda vertical (con cuatro por mitad: 22,5° + 45°·k).
 */
import { puntajeDelTramo, puntajeEstimado } from "./chequeo";
import { LETRAS, type ClaveDeCapa, type Letra } from "./documento/tipos";
import { partirEnLineas } from "./rueda";

// ── Medidas (unidades del viewBox) ────────────────────────────────────────────
export const W = 1000;
export const H = 690;
export const CX = 500;
export const CY = 380;
/** El radio del 100: el borde. */
export const R = 240;
/** Dónde va el rótulo de cada dimensión. */
export const R_ETIQUETA = 266;

/** Los anillos de la regla: el límite de cada franja y el borde. */
export const LIMITES = [20, 40, 60, 80, 100] as const;
/** «La base»: donde empieza Funcional. */
export const LA_BASE = 40;

/**
 * Las franjas de la regla, sacadas del cálculo del chequeo (lib/escala/chequeo.ts, el que da el resultado de una
 * empresa): el nivel, desde dónde (sin avance) y hasta dónde (con todo el avance que el tramo admite). Óptimo vale 100.
 * Si el chequeo cambia un tramo, el Radar lo sigue solo.
 */
export const FRANJAS: readonly { letra: Letra; desde: number; hasta: number }[] = LETRAS.map((letra) => ({
  letra,
  desde: puntajeDelTramo(letra, 0, 1),
  hasta: puntajeDelTramo(letra, 2, 1),
}));

/** «0 a 19», «100». */
export const rangoDeLaFranja = (fr: { desde: number; hasta: number }) => (fr.desde === fr.hasta ? `${fr.desde}` : `${fr.desde} a ${fr.hasta}`);

/** Dónde cae cada nivel entero en la regla: a la mitad de su franja (Óptimo, en 100), como el estimado del chequeo. */
const MITAD_DE_LA_FRANJA = LETRAS.map(puntajeEstimado);

/**
 * Un nivel promedio (1 = Deficiente … 5 = Óptimo, el de `ejesDelRadar`) a la regla de 0 a 100: cada nivel entero cae a
 * la mitad de su franja (1→10, 2→30, 3→50, 4→70, 5→100) y entre dos niveles se interpola en línea recta. Fuera de la
 * escala, al extremo más cercano.
 */
export function enLaRegla(valor: number): number {
  const v = Math.min(LETRAS.length, Math.max(1, Number.isFinite(valor) ? valor : 1));
  const i = Math.min(LETRAS.length - 2, Math.floor(v - 1));
  const t = v - 1 - i;
  return MITAD_DE_LA_FRANJA[i] + (MITAD_DE_LA_FRANJA[i + 1] - MITAD_DE_LA_FRANJA[i]) * t;
}

export const f = (v: number) => v.toFixed(1);
const aRadianes = (g: number) => (g * Math.PI) / 180;

/** Grados de reloj y radio → coordenadas del SVG (la y crece hacia abajo). */
export function polar(grados: number, r: number): [number, number] {
  return [CX + r * Math.sin(aRadianes(grados)), CY - r * Math.cos(aRadianes(grados))];
}

/** Grados de reloj y un valor de la regla (0–100) → coordenadas del SVG. Fuera de la regla, al extremo: nada se sale. */
export function enElRadar(grados: number, puntaje: number): [number, number] {
  return polar(grados, (R * Math.min(100, Math.max(0, puntaje))) / 100);
}

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

/** Un anillo de la regla: el polígono con un vértice en cada eje, a la altura de `puntaje`. */
export function anilloDelRadar(angulos: readonly number[], puntaje: number): [number, number][] {
  return [...angulos].sort((a, b) => a - b).map((g) => enElRadar(g, puntaje));
}

/** Los puntos de un polígono, para el atributo `points`. */
export const puntosSvg = (ps: readonly [number, number][]) => ps.map((p) => `${f(p[0])},${f(p[1])}`).join(" ");

/**
 * Dónde cruza un anillo la vertical del centro, arriba (`"arriba"`) o abajo: ahí van los números de la regla y el chip
 * de «la base». Es el lado que une el último eje de una mitad con el primero de la otra; si no hay lado que cruce (un
 * área con todas sus dimensiones en una mitad), el radio a secas.
 */
export function yEnElCentro(angulos: readonly number[], puntaje: number, lado: "arriba" | "abajo"): number {
  const derecha = angulos.filter((g) => g < 180);
  const izquierda = angulos.filter((g) => g >= 180);
  const radio = (R * puntaje) / 100;
  if (!derecha.length || !izquierda.length) return lado === "arriba" ? CY - radio : CY + radio;
  // Arriba: del último eje de la izquierda al primero de la derecha. Abajo: del último de la derecha al primero de la izquierda.
  const [px, py] = enElRadar(lado === "arriba" ? Math.max(...izquierda) : Math.max(...derecha), puntaje);
  const [qx, qy] = enElRadar(lado === "arriba" ? Math.min(...derecha) : Math.min(...izquierda), puntaje);
  const t = (CX - px) / (qx - px);
  return py + (qy - py) * t;
}

// ── Los rótulos ───────────────────────────────────────────────────────────────

/** Un nombre de dimensión va en renglones de hasta 22 letras («Tecnología y / Automatización»). */
const LETRAS_POR_RENGLON = 22;
const RENGLON = 18;

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
    x: derecha ? 790 : 210,
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
  // Un poco más allá del borde, para que tocar cerca del 100 también cuente.
  return [[CX, CY], polar(g0, R + 20), polar(grados, R + 20), polar(g1, R + 20)];
}
