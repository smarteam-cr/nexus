/**
 * lib/escala/areas-superpuestas.ts — las otras áreas encima del radar de una empresa (RadarDeUnaEmpresa con `otras`: La
 * escala de la preventa, uso interno; la página del cliente no las pasa). Lógica pura, sin React:
 *   · `alinearArea`: la parte k de cada capa de otra área va sobre la parte k de esa capa de la principal.
 *   · `partesPorEje`: en cada eje del radar, la dimensión de cada área que cae ahí, la principal primero. Con dos o más,
 *     la tarjeta de ese eje muestra una sección por área (8 nov, Elías: «debe aparecer la información de cada
 *     departamento»).
 *   · `areasAlCambiar`: al sumar o sacar un área, cuál entra y cuál sale. Solo esas se animan; las demás quedan quietas
 *     (8 nov, Elías: «que se pueda ver como fluido dónde entra y se pone una… solo actualice la escala»).
 */
import type { ClaveDeCapa } from "./documento/tipos";
import type { DimensionDelRadar } from "./radar-de-una-empresa";

/** Otra área dibujada encima de la principal, con su color. Sus dimensiones con SUS claves. */
export interface AreaSuperpuesta {
  area: string;
  color: string;
  dimensiones: readonly DimensionDelRadar[];
  /**
   * Solo mientras dura su animación: `entra` (recién sumada: crece desde el centro) o `sale` (recién sacada: se encoge y
   * se apaga, sin cursor ni foco). Sin fase, quieta.
   */
  fase?: "entra" | "sale";
}

/** Un área superpuesta ya alineada con los ejes de la principal: `reales` lleva cada eje a la dimensión de esa área. */
export interface AreaAlineada {
  area: string;
  color: string;
  fase?: "entra" | "sale";
  dims: DimensionDelRadar[];
  reales: Record<string, string>;
}

/** La parte k de cada capa de `otra` sobre la parte k de esa capa de la principal (sin la suya: eje sin vértice). */
export function alinearArea(dims: readonly DimensionDelRadar[], otra: AreaSuperpuesta): AreaAlineada {
  const reales: Record<string, string> = {};
  const vistos: Partial<Record<ClaveDeCapa, number>> = {};
  const alineadas = dims.map((d): DimensionDelRadar => {
    const k = vistos[d.capa] ?? 0;
    vistos[d.capa] = k + 1;
    const suya = otra.dimensiones.filter((x) => x.capa === d.capa)[k];
    if (suya) reales[d.clave] = suya.clave;
    return suya
      ? { ...suya, clave: d.clave, nombre: d.nombre, numero: d.numero }
      : { clave: d.clave, nombre: d.nombre, capa: d.capa, preguntada: false, nivel: null, puntaje: null };
  });
  return { area: otra.area, color: otra.color, fase: otra.fase, dims: alineadas, reales };
}

/**
 * En cada eje de la principal (su clave), las dimensiones que caen ahí: la de la principal y, en el orden de `otras`, la
 * de cada área que tiene una en ese lugar. Las que están saliendo no cuentan.
 */
export function partesPorEje(dims: readonly DimensionDelRadar[], otras: readonly AreaSuperpuesta[]): Record<string, string[]> {
  const alineadas = otras.filter((o) => o.fase !== "sale").map((o) => alinearArea(dims, o));
  return Object.fromEntries(dims.map((d) => [d.clave, [d.clave, ...alineadas.flatMap((a) => (a.reales[d.clave] ? [a.reales[d.clave]] : []))]]));
}

/** Lo que se está animando: los nombres de las áreas que entran y las áreas que salen (con lo último que se dibujó). */
export interface CambioDeAreas<T extends { area: string }> {
  entran: readonly string[];
  salen: readonly T[];
}

export const SIN_CAMBIO = { entran: [] as readonly string[], salen: [] as readonly never[] } as const;

/**
 * De `antes` a `ahora` (las áreas dibujadas, por nombre): entran las nuevas, salen las que ya no están (con su último
 * dibujo, para que se vayan desde donde estaban). `enCurso` es lo que todavía se anima del cambio anterior: lo que sigue
 * entrando se queda, lo que sigue saliendo también, salvo que haya vuelto (ahí entra de nuevo). Reordenar o cambiar cuál
 * es la principal no anima nada.
 */
export function areasAlCambiar<T extends { area: string }>(
  antes: readonly T[],
  ahora: readonly T[],
  enCurso: CambioDeAreas<T> = SIN_CAMBIO,
): CambioDeAreas<T> {
  const hoy = new Set(ahora.map((a) => a.area));
  const ayer = new Set(antes.map((a) => a.area));
  const entran = [...new Set([...enCurso.entran.filter((n) => hoy.has(n)), ...ahora.filter((a) => !ayer.has(a.area)).map((a) => a.area)])];
  const salen = new Map<string, T>();
  for (const a of enCurso.salen) if (!hoy.has(a.area) && !ayer.has(a.area)) salen.set(a.area, a);
  for (const a of antes) if (!hoy.has(a.area)) salen.set(a.area, a);
  return { entran, salen: [...salen.values()] };
}
