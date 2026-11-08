/**
 * lib/escala/areas-superpuestas.ts — las otras áreas encima del radar de una empresa (RadarDeUnaEmpresa con `otras`: La
 * escala de la preventa, uso interno; la página del cliente no las pasa). Lógica pura, sin React:
 *   · `alinearArea`: la parte k de cada capa de otra área va sobre la parte k de esa capa de la principal.
 *   · `partesPorEje`: en cada eje del radar, la dimensión de cada área que cae ahí, la principal primero. Con dos o más,
 *     la tarjeta de ese eje muestra una sección por área (8 nov, Elías: «debe aparecer la información de cada
 *     departamento»).
 *   · `areasAlCambiar`: al sumar o sacar un área, cuál entra y cuál sale. Solo esas se animan; las demás quedan quietas
 *     (8 nov, Elías: «que se pueda ver como fluido dónde entra y se pone una… solo actualice la escala»).
 *   · `principalYFuera`, `alTocarUnArea` y `alTocarUnNodo`: cuál es la principal (se queda al sumar otra; cambia al tocar
 *     un nodo de otra o al sacarla) y qué elegidas sin nada se muestran con «Sumar…».
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

/**
 * Las áreas presionadas en La escala (en el orden en que se eligieron) y la que se pidió como principal: la de los
 * nombres, el centro y el detalle. `principalId` es un pedido: solo vale si esa área está elegida y tiene algo.
 */
export interface EleccionDeAreas {
  elegidas: readonly string[];
  principalId: string | null;
}

/**
 * Qué se ve con una elección: la principal (la pedida si está elegida y tiene algo; si no, la última elegida con algo) y
 * las elegidas SIN nada, que se muestran cada una con «Sumar…» para que el botón presionado diga lo que hay (también la
 * principal que se sacó y quedó sin nada: así se deshace con el mismo botón).
 */
export function principalYFuera(e: EleccionDeAreas, conAlgo: (id: string) => boolean): { principal: string | null; fuera: string[] } {
  const principal = e.elegidas.find((id) => id === e.principalId && conAlgo(id)) ?? [...e.elegidas].reverse().find(conAlgo) ?? null;
  return { principal, fuera: e.elegidas.filter((id) => !conAlgo(id)) };
}

/**
 * Tocar el botón de un área (8 nov, Elías: «solo actualice la escala»): sumarla NO cambia la principal (la nueva entra
 * encima; si todavía no hay principal, la sumada lo es); sacarla (si queda otra) suelta la principal solo si era ella,
 * y entonces pasa a la última elegida con algo.
 */
export function alTocarUnArea(e: EleccionDeAreas, id: string, conAlgo: (id: string) => boolean): EleccionDeAreas {
  const { principal } = principalYFuera(e, conAlgo);
  if (!e.elegidas.includes(id)) return { elegidas: [...e.elegidas, id], principalId: principal ?? id };
  if (e.elegidas.length <= 1) return e;
  return { elegidas: e.elegidas.filter((x) => x !== id), principalId: principal === id || e.principalId === id ? null : e.principalId };
}

/** Tocar un nodo de otra área elegida la vuelve la principal. */
export function alTocarUnNodo(e: EleccionDeAreas, areaId: string): EleccionDeAreas {
  return e.elegidas.includes(areaId) ? { ...e, principalId: areaId } : e;
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

/**
 * El orden de una lista que se anima al cambiar (las tarjetas debajo del radar, 8 nov): las de `ahora`, en su orden, y
 * cada una de `salen` donde estaba en `antes` (después de la última de antes que sigue a la vista), para que se pliegue
 * en su lugar y no salte al final. Una que sale y no estaba en `antes` va al final.
 */
export function ordenConLasQueSalen(antes: readonly string[], ahora: readonly string[], salen: readonly string[]): string[] {
  const out = [...ahora];
  for (const id of salen) {
    if (out.includes(id)) continue;
    const i = antes.indexOf(id);
    if (i < 0) {
      out.push(id);
      continue;
    }
    let pos = 0;
    for (let k = i - 1; k >= 0; k--) {
      const j = out.indexOf(antes[k]);
      if (j >= 0) {
        pos = j + 1;
        break;
      }
    }
    out.splice(pos, 0, id);
  }
  return out;
}

/** Una lista que se anima (ListaQueSeAnima.tsx): lo que está, lo que se veía antes del último cambio y qué se mueve. */
export interface VistaDeLista {
  ids: readonly string[];
  seVeia: readonly string[];
  cambio: CambioDeAreas<{ area: string }>;
}

export const vistaInicial = (ids: readonly string[]): VistaDeLista => ({ ids: [...ids], seVeia: [...ids], cambio: SIN_CAMBIO });

const comoClaves = (ids: readonly string[]) => ids.map((area) => ({ area }));

/** Al cambiar la lista: lo que se veía (con lo que todavía salía en su lugar) y qué entra y qué sale ahora. */
export function vistaAlCambiar(v: VistaDeLista, ids: readonly string[]): VistaDeLista {
  const seVeia = ordenConLasQueSalen(v.seVeia, v.ids, v.cambio.salen.map((a) => a.area));
  return { ids: [...ids], seVeia, cambio: areasAlCambiar(comoClaves(v.ids), comoClaves(ids), v.cambio) };
}

/** Cuando termina la animación: nada se mueve y lo que salió ya no se dibuja. */
export const vistaQuieta = (v: VistaDeLista): VistaDeLista => ({ ids: v.ids, seVeia: [...v.ids], cambio: SIN_CAMBIO });

/** Las piezas a dibujar, en orden, con su fase: las que están y, donde estaban, las que salen. */
export function piezasDeLaVista(v: VistaDeLista): { id: string; fase?: "entra" | "sale" }[] {
  const salen = v.cambio.salen.map((a) => a.area);
  return ordenConLasQueSalen(v.seVeia, v.ids, salen).map((id) => ({
    id,
    fase: !v.ids.includes(id) ? "sale" : v.cambio.entran.includes(id) ? "entra" : undefined,
  }));
}
