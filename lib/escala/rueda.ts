/**
 * lib/escala/rueda.ts — la geometría de la rueda de un área. PURO: sin React ni colores.
 *
 * La usa el Mapa (components/escala/Mapa.tsx: celdas con conteos). El radar de la teoría (components/escala/Radar.tsx)
 * tiene su propia geometría (lib/escala/radar-dibujo.ts) y de acá solo toma `partirEnLineas`; el radar de UNA empresa
 * (la página pública del test y su PDF) dejó de ser esta rueda el 2026-10-29: es el de la teoría con la empresa como
 * figura (lib/escala/radar-de-una-empresa.ts).
 *
 * Grados de reloj: 0 = arriba, en el sentido de las agujas. La base operativa ocupa la mitad derecha y la
 * producción la izquierda, separadas por un hueco arriba y abajo; arriba, en ese hueco, van los nombres de los
 * niveles. Cada anillo es un nivel: Deficiente adentro, Óptimo en el borde.
 */
import type { ClaveDeCapa } from "./documento/tipos";

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
