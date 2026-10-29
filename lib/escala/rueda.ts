/**
 * lib/escala/rueda.ts — la geometría de la rueda de un área. PURO: sin React ni colores.
 *
 * La comparten el Mapa (components/escala/Mapa.tsx: celdas con conteos) y el radar de una empresa
 * (components/escala/RadarDeUnaEmpresa.tsx, para la página pública del test y su PDF). Las dos dibujan la MISMA
 * rueda —mismo tamaño, mismas mitades, mismos rótulos en el mismo lugar— y solo cambia lo de adentro (pedido de
 * Elías, 2026-10-28: «básicamente solo debería cambiar lo del centro»). Un número que se mueve acá se mueve en las
 * dos. El Radar de la escala (components/escala/Radar.tsx) dejó la rueda el mismo día por un radar clásico
 * (lib/escala/radar-dibujo.ts); de acá solo toma `lineaDeLaSerie` y `partirEnLineas`.
 *
 * Grados de reloj: 0 = arriba, en el sentido de las agujas. La base operativa ocupa la mitad derecha y la
 * producción la izquierda, separadas por un hueco arriba y abajo; arriba, en ese hueco, van los nombres de los
 * niveles. Cada anillo es un nivel: Deficiente adentro, Óptimo en el borde.
 */
import { LETRAS, type ClaveDeCapa, type Letra } from "./documento/tipos";

// ── Medidas (unidades del viewBox) ────────────────────────────────────────────
export const W = 1300;
export const H = 900;
export const CX = 650;
export const CY = 450;
/** El círculo del centro, donde se dice qué se mira. */
export const R_CENTRO = 104;
/** Donde empieza Deficiente y cuánto mide cada anillo. */
export const R_DENTRO = 114;
export const ANCHO = 52;
export const R_FUERA = R_DENTRO + ANCHO * 5;
/** La línea de la base: el borde de adentro de Funcional. */
export const R_BASE = R_DENTRO + ANCHO * 2;
/** La banda gris de cada capa, en el borde. */
export const R_BANDA = R_FUERA + 16;
export const R_ETIQUETA = R_FUERA + 50;
/** Grados libres arriba y abajo: separan las dos capas, y arriba van los nombres de los niveles. */
export const HUECO = 34;
/** Aire entre celdas: grados entre porciones y unidades entre anillos. */
export const AIRE_ANGULAR = 1.4;
export const AIRE_RADIAL = 3;

export const f = (v: number) => v.toFixed(1);
export const aRadianes = (g: number) => (g * Math.PI) / 180;

/** Grados de reloj y radio → coordenadas del SVG (la y crece hacia abajo). */
export function polar(grados: number, r: number): [number, number] {
  return [CX + r * Math.sin(aRadianes(grados)), CY - r * Math.cos(aRadianes(grados))];
}

/** Un sector de anillo: entre dos radios y dos ángulos. */
export function sectorDeAnillo(r0: number, r1: number, g0: number, g1: number): string {
  const [ax, ay] = polar(g0, r1);
  const [bx, by] = polar(g1, r1);
  const [cx, cy] = polar(g1, r0);
  const [dx, dy] = polar(g0, r0);
  const grande = g1 - g0 > 180 ? 1 : 0;
  return `M${f(ax)} ${f(ay)}A${r1} ${r1} 0 ${grande} 1 ${f(bx)} ${f(by)}L${f(cx)} ${f(cy)}A${r0} ${r0} 0 ${grande} 0 ${f(dx)} ${f(dy)}Z`;
}

/** Un arco suelto (la banda de una capa). */
export function arco(r: number, g0: number, g1: number): string {
  const [ax, ay] = polar(g0, r);
  const [bx, by] = polar(g1, r);
  return `M${f(ax)} ${f(ay)}A${r} ${r} 0 ${g1 - g0 > 180 ? 1 : 0} 1 ${f(bx)} ${f(by)}`;
}

/** Los radios de un anillo (k = 0 es Deficiente), con aire entre anillos. */
export const anillo = (k: number): [number, number] => [R_DENTRO + ANCHO * k + AIRE_RADIAL / 2, R_DENTRO + ANCHO * (k + 1) - AIRE_RADIAL / 2];

/** La mitad de cada capa: la base a la derecha, la producción a la izquierda. */
export const MITAD: Record<ClaveDeCapa, [number, number]> = {
  base: [HUECO / 2, 180 - HUECO / 2],
  produccion: [180 + HUECO / 2, 360 - HUECO / 2],
};

/** Los ángulos de la porción de cada dimensión, repartidos dentro de la mitad de su capa (en el orden en que vienen). */
export function porciones(dims: readonly { id: string; capa: ClaveDeCapa }[]): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const clave of Object.keys(MITAD) as ClaveDeCapa[]) {
    const [inicio, fin] = MITAD[clave];
    const deLaCapa = dims.filter((d) => d.capa === clave);
    const paso = (fin - inicio) / Math.max(1, deLaCapa.length);
    deLaCapa.forEach((d, j) => out.set(d.id, [inicio + paso * j + AIRE_ANGULAR / 2, inicio + paso * (j + 1) - AIRE_ANGULAR / 2]));
  }
  return out;
}

/** Un texto partido en líneas de hasta `max` caracteres, sin cortar palabras (el SVG no parte solo). */
export function partirEnLineas(texto: string, max: number): string[] {
  const out: string[] = [];
  let linea = "";
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    if (linea && `${linea} ${palabra}`.length > max) {
      out.push(linea);
      linea = palabra;
    } else linea = linea ? `${linea} ${palabra}` : palabra;
  }
  if (linea) out.push(linea);
  return out;
}

// ── Dónde va cada rótulo ──────────────────────────────────────────────────────

/**
 * El nombre de una capa al costado de su mitad («BASE OPERATIVA» y su descripción): en mayúsculas, partido en
 * renglones de 10 letras, y la descripción en renglones de 25. `caja` es la zona que recibe el cursor.
 */
export function rotuloDeCapa(clave: ClaveDeCapa, nombre: string, descripcion: string | null) {
  const derecha = clave === "base";
  const x = derecha ? CX + R_BANDA + 26 : CX - R_BANDA - 26;
  const lineas = partirEnLineas(nombre.toUpperCase(), 10);
  const lineasDeDescripcion = descripcion ? partirEnLineas(descripcion, 25) : [];
  const alto = lineas.length * 34 + lineasDeDescripcion.length * 21;
  const y0 = CY - alto / 2 + 24;
  return {
    x,
    ancla: (derecha ? "start" : "end") as "start" | "end",
    nombre: lineas.map((texto, j) => ({ texto, y: y0 + j * 34 })),
    descripcion: lineasDeDescripcion.map((texto, j) => ({ texto, y: y0 + lineas.length * 34 - 6 + j * 21 })),
    caja: { x: derecha ? x - 8 : x - 232, y: y0 - 32, width: 240, height: alto + 22 },
  };
}

/**
 * El rótulo de una dimensión, afuera de su porción: arriba su número (y sus reportes), abajo su nombre. A los
 * costados hay poco ancho: un nombre de más de 24 letras va en dos líneas, para que no se salga del dibujo. Arriba el bloque
 * crece hacia arriba; abajo, hacia abajo; a los costados, centrado.
 */
export function rotuloDeDimension(medio: number, nombre: string) {
  const [x, y] = polar(medio, R_ETIQUETA);
  const s = Math.sin(aRadianes(medio));
  const c = Math.cos(aRadianes(medio));
  const ancla: "start" | "end" | "middle" = s > 0.15 ? "start" : s < -0.15 ? "end" : "middle";
  // 24 letras y no más: «Tecnología y Automatización» (27) en un renglón tocaba el borde del dibujo.
  const lineas = Math.abs(s) > 0.8 ? partirEnLineas(nombre, 24) : [nombre];
  const extra = (lineas.length - 1) * 21;
  const y0 = c > 0.35 ? y - 24 - extra : c < -0.35 ? y + 10 : y - 8 - extra / 2;
  return {
    x,
    ancla,
    /** La línea del número («1.7 · 2 reportes»). */
    yNumero: y0,
    nombre: lineas.map((texto, j) => ({ texto, y: y0 + 22 + j * 21 })),
    /** Una línea más abajo del nombre: «no aplica a este perfil». */
    yNota: y0 + 42 + extra,
  };
}

/** La altura del nombre de cada nivel, en el hueco de arriba (centrado en x = CX). */
export function yDelNombreDeNivel(k: number): number {
  const [r0, r1] = anillo(k);
  return CY - (r0 + r1) / 2 + 5;
}

// ── Dónde cae un punto ────────────────────────────────────────────────────────

/**
 * De una posición medida en anillos (0 = el borde de adentro de Deficiente, 5 = el borde de afuera de Óptimo) al
 * radio. Fuera de la escala, al borde: un punto nunca se sale de la rueda.
 */
export function radioEnAnillos(posicion: number): number {
  return R_DENTRO + ANCHO * Math.min(LETRAS.length, Math.max(0, posicion));
}

/**
 * Un puntaje del chequeo (0–100) a su posición, siempre DENTRO del anillo de su nivel: el nivel manda (es el que se
 * le dice a la empresa) y el puntaje dice cuánto avanzó dentro de él. Los tramos son los del chequeo
 * (lib/escala/chequeo.ts): Deficiente 0–19, Inicial 20–39, Funcional 40–59, Eficiente 60–79 y Óptimo 100, que va
 * al medio de su anillo. Un margen deja el punto lejos de la raya entre anillos, para que no se lea en el vecino.
 */
export function posicionDelPuntaje(puntaje: number, nivel: Letra): number {
  const k = LETRAS.indexOf(nivel);
  if (nivel === "O") return k + 0.5;
  const avance = (puntaje - 20 * k) / 20;
  return k + Math.min(0.85, Math.max(0.15, Number.isFinite(avance) ? avance : 0.5));
}

// ── La línea de una serie ─────────────────────────────────────────────────────

/**
 * Por dónde va la línea de una serie: cada punto unido con el del eje vecino, en el sentido de las agujas. Un eje sin
 * punto corta la línea (no salta por encima de él). El lado que une las dos mitades cruza el hueco, donde van los
 * nombres de los niveles y «la base»: se marca (`cruzaElHueco`) para dibujarlo tenue y no tapar esos rótulos. El
 * relleno existe solo si todos los ejes tienen punto.
 */
export function lineaDeLaSerie<P>(ejes: readonly { medio: number; capa: ClaveDeCapa; punto: P | null }[]): {
  lados: { de: P; a: P; cruzaElHueco: boolean }[];
  relleno: P[] | null;
} {
  const orden = [...ejes].sort((x, y) => x.medio - y.medio);
  const n = orden.length;
  const lados: { de: P; a: P; cruzaElHueco: boolean }[] = [];
  // Con dos ejes hay un solo lado; con más, el último se cierra con el primero.
  const cuantos = n < 2 ? 0 : n === 2 ? 1 : n;
  for (let i = 0; i < cuantos; i++) {
    const x = orden[i];
    const y = orden[(i + 1) % n];
    // El lado que cierra la vuelta (del último eje al primero) siempre pasa por el hueco de arriba, aunque un área
    // tenga todas sus dimensiones en una sola capa.
    const cierra = n > 2 && i === n - 1;
    if (x.punto !== null && y.punto !== null) lados.push({ de: x.punto, a: y.punto, cruzaElHueco: cierra || x.capa !== y.capa });
  }
  const relleno = n >= 3 && orden.every((e) => e.punto !== null) ? orden.map((e) => e.punto as P) : null;
  return { lados, relleno };
}

// ── El radar de una empresa ───────────────────────────────────────────────────

/** Una dimensión con el resultado de UNA empresa (la interfaz de components/escala/RadarDeUnaEmpresa.tsx). */
export interface DimensionDeUnaEmpresa {
  /** Única en el área: el id de la dimensión («1.3»). */
  clave: string;
  /** Lo que se lee arriba del nombre, como en el mapa. Por defecto, la clave. */
  numero?: string;
  nombre: string;
  capa: ClaveDeCapa;
  /** 0–100, el del chequeo. null: sin dato (no aplica, o no se contestó). */
  puntaje: number | null;
  /** El nivel que se le dice a la empresa. null: sin dato. */
  nivel: Letra | null;
  /** Contestó «No lo sé» (cuenta como el nivel más bajo): el punto se marca distinto. */
  noLoSe?: boolean;
}

/**
 * Dónde va cada punto de una empresa: el ángulo del medio de la porción de su dimensión y el radio de su puntaje
 * dentro del anillo de su nivel. Sin nivel no hay punto (null). Sin puntaje, el medio del anillo de su nivel.
 */
export function puntosDeUnaEmpresa(dims: readonly DimensionDeUnaEmpresa[]): ({ x: number; y: number; medio: number } | null)[] {
  const angulos = porciones(dims.map((d) => ({ id: d.clave, capa: d.capa })));
  return dims.map((d) => {
    const ang = angulos.get(d.clave);
    if (!d.nivel || !ang) return null;
    const medio = (ang[0] + ang[1]) / 2;
    const posicion = d.puntaje === null ? LETRAS.indexOf(d.nivel) + 0.5 : posicionDelPuntaje(d.puntaje, d.nivel);
    const [x, y] = polar(medio, radioEnAnillos(posicion));
    return { x, y, medio };
  });
}
