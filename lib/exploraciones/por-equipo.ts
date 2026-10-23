/**
 * lib/exploraciones/por-equipo.ts — qué se sabe de cada equipo del cliente, para el panel de la derecha. PURO.
 *
 * Feedback de Ventas del 22 oct: el panel decía «Retos ✓» desde la primera sesión de CEMACO (comercial) y no decía que de
 * marketing no se sabía cómo lo miden. Con las sesiones por equipo (equipos.ts), el panel cuenta, por equipo, sus
 * sesiones y cuáles de sus temas ya se respondieron (lo marcado hecho en «En vivo» o lo que la lectura de la reunión dio
 * por respondido). Las sesiones sin equipo se cuentan aparte, para elegirles uno.
 */
import { EQUIPOS, EQUIPOS_DEL_CLIENTE, temaDeEquipo, type ClaveDeEquipo } from "./equipos";

export interface TemaDeLaFila {
  id: string;
  nombre: string;
  respondido: boolean;
}

export interface FilaPorEquipo {
  equipo: ClaveDeEquipo;
  nombre: string;
  /** Las sesiones con este equipo (sin las que no se hicieron) y cuántas ya pasaron. */
  sesiones: number;
  hechas: number;
  temas: TemaDeLaFila[];
  respondidos: number;
}

/**
 * `dimensionesDelArea`: las dimensiones de un área de la escala. El «dónde duele» de un equipo con área se pregunta con
 * la dimensión de su área cuando el cliente ya contó un dolor (plan-de-la-guia.ts › `planDelEquipo`): respondida esa
 * dimensión en impacto, el tema cuenta como respondido.
 */
export function resumenPorEquipo(
  pestanas: readonly { sesion: { equipo?: ClaveDeEquipo } | null; hecha: boolean; noSeHizo?: boolean }[],
  yaPreguntado: ReadonlyMap<string, ReadonlySet<unknown>>,
  dimensionesDelArea: (area: string) => readonly string[] = () => [],
): { filas: FilaPorEquipo[]; sinEquipo: number } {
  const cuentan = pestanas.filter((p) => !p.noSeHizo);
  const filas: FilaPorEquipo[] = [];
  for (const equipo of EQUIPOS_DEL_CLIENTE) {
    const suyas = cuentan.filter((p) => p.sesion?.equipo === equipo);
    if (!suyas.length) continue;
    const area = EQUIPOS[equipo].area;
    const dolorPorDimension = !!area && dimensionesDelArea(area).some((d) => !!yaPreguntado.get(d)?.has("impacto"));
    const temas = EQUIPOS[equipo].temas.map((t) => {
      const id = temaDeEquipo(equipo, t.tema);
      return { id, nombre: t.nombre, respondido: (yaPreguntado.get(id)?.size ?? 0) > 0 || (t.tema === "dolor" && dolorPorDimension) };
    });
    filas.push({
      equipo,
      nombre: EQUIPOS[equipo].nombre,
      sesiones: suyas.length,
      hechas: suyas.filter((p) => p.hecha).length,
      temas,
      respondidos: temas.filter((t) => t.respondido).length,
    });
  }
  return { filas, sinEquipo: cuentan.filter((p) => !p.sesion?.equipo).length };
}
