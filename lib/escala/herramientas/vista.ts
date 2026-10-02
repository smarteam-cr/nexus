/**
 * lib/escala/herramientas/vista.ts — lo que la pantalla de la escala recibe del mapa. PURO.
 *
 * Como con la escala, baja solo lo del área que se mira: de cada herramienta, lo que aporta en los
 * criterios que ESA lectura tiene (la general, o la edición elegida, con sus propios). Lo que el mapa
 * dice de otra área o de otra edición no viaja.
 */
import type { Area } from "../documento/tipos";
import type { Herramienta, MapaDeHerramientas } from "./tipos";

export interface HerramientasDeLaVista {
  version: string;
  fecha: string | null;
  estado: string | null;
  intro: string[];
  /** En el orden del documento. `aportes`: solo los de los criterios del área que se ve. */
  herramientas: Herramienta[];
}

export function herramientasDeLaVista(mapa: MapaDeHerramientas | null, area: Area): HerramientasDeLaVista | null {
  if (!mapa) return null;
  const delArea = new Set(area.dimensiones.flatMap((d) => d.niveles.flatMap((n) => n.criterios.map((c) => c.id))));
  return {
    version: mapa.version,
    fecha: mapa.fecha,
    estado: mapa.estado,
    intro: mapa.intro,
    herramientas: mapa.herramientas.map((h) => ({
      ...h,
      aportes: Object.fromEntries(Object.entries(h.aportes).filter(([id]) => delArea.has(id))),
    })),
  };
}

/** Lo que aporta cada herramienta prendida en un criterio, en el orden del documento. */
export function aportesDelCriterio(
  vista: HerramientasDeLaVista | null,
  activas: readonly string[],
  criterio: string,
): { herramienta: Herramienta; aporte: string }[] {
  if (!vista || activas.length === 0) return [];
  return vista.herramientas.filter((h) => activas.includes(h.clave) && h.aportes[criterio] !== undefined).map((h) => ({ herramienta: h, aporte: h.aportes[criterio] }));
}

/** `?h=insider,hubspot` → las claves, sin repetir. Lo que no parece una clave se ignora. */
export function herramientasDesdeUrl(h: string | null | undefined): string[] {
  if (!h) return [];
  return [...new Set(h.split(",").map((s) => s.trim().toLowerCase()))].filter((s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s));
}

/** Las prendidas que el mapa publicado tiene (un enlace viejo puede nombrar una que ya no está). */
export function activasQueExisten(activas: readonly string[], vista: HerramientasDeLaVista | null): string[] {
  if (!vista) return [];
  return activas.filter((a) => vista.herramientas.some((h) => h.clave === a));
}
