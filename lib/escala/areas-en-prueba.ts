/**
 * lib/escala/areas-en-prueba.ts — LAS ÁREAS QUE TODAVÍA VIVEN SOLO EN «LA ESCALA». PURO y CLIENT-SAFE.
 *
 * TI entró a la escala en la 9.3.0 (Elías, 2026-11-18: «un diagnóstico para el departamento de tecnología, no sobre
 * tecnología»). Es un mínimo viable: se ve en la sección La escala, tiene su test público y su página de resultado, y
 * la migración a la preventa y a la escala de cada empresa viene después, a propósito y con su revisión.
 *
 * Hasta esa migración, la escala publicada se lee SIN estas áreas por defecto (`leerEscalaVigente`): la preventa, la
 * escala de la cuenta, el Resumen, los agentes y todo lo que no se tocó siguen viendo exactamente las tres de antes,
 * aunque la versión publicada ya traiga TI. Solo la sección La escala y el test la piden con ellas
 * (con la opción `conAreasEnPrueba`). Migrar un área es sacarla de esta lista, revisando antes a cada lector que la va a ver.
 */
import type { Escala } from "./documento/tipos";

export const AREAS_EN_PRUEBA: readonly string[] = ["4"];

export function esAreaEnPrueba(areaId: string): boolean {
  return AREAS_EN_PRUEBA.includes(areaId);
}

/** Una por escala: la escala publicada se cachea por huella y la comparten todos, así que nunca se muta. */
const sinLasEnPrueba = new WeakMap<Escala, Escala>();

/** La misma escala sin las áreas en prueba (ni las de sus ediciones). Sin ninguna, devuelve la misma. */
export function sinAreasEnPrueba(escala: Escala): Escala {
  if (!escala.areas.some((a) => esAreaEnPrueba(a.id))) return escala;
  const previa = sinLasEnPrueba.get(escala);
  if (previa) return previa;
  const fuera = escala.areas.filter((a) => esAreaEnPrueba(a.id));
  const deFuera = (id: string) => esAreaEnPrueba(id.split(".")[0]);
  const filtrada: Escala = {
    ...escala,
    areas: escala.areas.filter((a) => !esAreaEnPrueba(a.id)),
    ediciones: escala.ediciones.map((e) => ({ ...e, areas: e.areas.filter((a) => !esAreaEnPrueba(a.id)) })),
    // Sus mensajes de riesgo, su orden de dependencias propio y sus reglas de asignación (las que la nombran en negrita).
    // Una regla general («**Equipo y Gobierno**» de cada área) se queda, sin sus dimensiones.
    riesgos: Object.fromEntries(Object.entries(escala.riesgos).filter(([id]) => !deFuera(id))),
    dependencias: escala.dependencias.filter((d) => !fuera.some((a) => d.cuando.trim() === a.nombre)),
    asignacion: escala.asignacion
      .filter((r) => !fuera.some((a) => r.texto.includes(`**${a.nombre}**`)))
      .map((r) => ({ ...r, dimensiones: r.dimensiones.filter((id) => !deFuera(id)) })),
  };
  sinLasEnPrueba.set(escala, filtrada);
  return filtrada;
}
