/**
 * lib/escala/radar.ts — qué cuenta cada celda de la escala (dimensión × etapa). PURO.
 *
 * Lo comparten el Mapa (components/escala/Mapa.tsx: la intensidad de cada celda de la rueda) y el radar de la teoría
 * (components/escala/Radar.tsx: el número de cada cruce de eje y anillo). Una sola regla para las dos vistas: un número
 * que cambia acá cambia en las dos.
 *
 * El radar de la teoría (Elías, 2026-10-28, al rechazar el de promedios: «se ve como si estuviera seleccionada una
 * empresa») es el Mapa en forma de radar: un eje por dimensión, un anillo por etapa y, en cada cruce, cuántos criterios
 * tiene esa celda de lo que se elige en «Qué se cuenta». Es la escala misma: ningún número es «dónde está» alguien.
 *
 * Con el perfil de negocio cuentan solo los criterios que aplican (la regla de `aplica`, como en las otras vistas), y
 * una dimensión que no aplica no cuenta nada. «Escondidos por el perfil» es lo contrario: lo que el perfil saca, y
 * solo se ofrece con un perfil elegido.
 */
import { aplica, dimensionAplica, type Perfil } from "./documento/perfil";
import { enlacesQueAplican } from "./documento/requeridos";
import { LETRAS, type Area, type ClaveDeCapa, type Criterio, type Dimension, type Letra, type Nivel } from "./documento/tipos";
import type { RequeridosDelArea } from "./vista";

export type QueSeCuenta = "criterios" | "habitos" | "riesgos" | "requeridos" | "perfil";

/** En el orden en que se ofrecen, con cómo se dice uno y varios («1 hábito», «3 hábitos»). */
export const QUE_SE_CUENTA: readonly { clave: QueSeCuenta; etiqueta: string; uno: string; varios: string; title: string }[] = [
  {
    clave: "criterios",
    etiqueta: "Todos los criterios",
    uno: "criterio",
    varios: "criterios",
    title: "Cuántos criterios tiene cada celda (con el perfil de negocio elegido, solo los que aplican).",
  },
  {
    clave: "habitos",
    etiqueta: "Hábitos",
    uno: "hábito",
    varios: "hábitos",
    title: "Cuántos criterios de cada celda son hábitos: algo que el equipo repite y que solo se confirma después de operar un tiempo.",
  },
  {
    clave: "riesgos",
    etiqueta: "Riesgos",
    uno: "criterio de riesgo",
    varios: "criterios de riesgo",
    title: "Cuántos criterios de cada celda son de riesgo: no deciden el nivel, pero hay que cumplirlos para pasar a Eficiente.",
  },
  {
    clave: "requeridos",
    etiqueta: "Requeridos",
    uno: "criterio que otros requieren",
    varios: "criterios que otros requieren",
    title: "Cuántos criterios de cada celda son requeridos por otros: dónde están los cimientos de la escala.",
  },
  {
    clave: "perfil",
    etiqueta: "Escondidos por el perfil",
    uno: "criterio escondido por el perfil",
    varios: "criterios escondidos por el perfil",
    title: "Cuántos criterios de cada celda NO aplican al perfil de negocio elegido y quedan escondidos.",
  },
];

/** ¿Hay un perfil de negocio elegido? */
export const conPerfil = (perfil: Perfil) => !!(perfil.cierre || perfil.despues || perfil.trafico);

/** Lo que se puede elegir: «Escondidos por el perfil» solo con un perfil elegido. */
export function opcionesDeQueSeCuenta(perfil: Perfil): QueSeCuenta[] {
  return QUE_SE_CUENTA.map((q) => q.clave).filter((q) => q !== "perfil" || conPerfil(perfil));
}

/** «1 hábito», «3 hábitos». */
export function enPalabras(n: number, que: QueSeCuenta): string {
  const q = QUE_SE_CUENTA.find((x) => x.clave === que)!;
  return `${n} ${n === 1 ? q.uno : q.varios}`;
}

/** ¿Cuenta este criterio en lo que se eligió? Lo que el perfil esconde solo cuenta en «Escondidos por el perfil». */
export function cuentaElCriterio(c: Criterio, que: QueSeCuenta, perfil: Perfil, requeridos: Pick<RequeridosDelArea, "loRequieren">): boolean {
  if (que === "perfil") return !aplica(c, perfil);
  if (!aplica(c, perfil)) return false;
  if (que === "habitos") return c.habito;
  if (que === "riesgos") return c.riesgo;
  if (que === "requeridos") return enlacesQueAplican(requeridos.loRequieren[c.id], perfil).length > 0;
  return true;
}

/** Cuántos criterios de una celda cuentan (la regla de `cuentaElCriterio`). */
export function cuentaDeLaCelda(
  criterios: readonly Criterio[],
  que: QueSeCuenta,
  perfil: Perfil,
  requeridos: Pick<RequeridosDelArea, "loRequieren">,
): number {
  return criterios.filter((c) => cuentaElCriterio(c, que, perfil, requeridos)).length;
}

/** Un eje del radar de la teoría: una dimensión con la cuenta de cada una de sus etapas. */
export interface EjeDeLaTeoria {
  dimensionId: string;
  nombre: string;
  capa: ClaveDeCapa;
  /** Con el perfil elegido: si no aplica, sus cruces van en 0 (salvo en «Escondidos por el perfil»). */
  aplica: boolean;
  cuentas: Record<Letra, number>;
}

/**
 * Los criterios de un cruce: los de esa dimensión en esa etapa que cuentan en lo que se eligió. Una dimensión que no
 * aplica al perfil no cuenta nada, salvo en «Escondidos por el perfil». El número del cruce y la lista del panel salen
 * de acá: no pueden decir cosas distintas.
 */
export function criteriosDelCruce(
  dimension: Dimension,
  nivel: Pick<Nivel, "criterios">,
  que: QueSeCuenta,
  perfil: Perfil,
  requeridos: Pick<RequeridosDelArea, "loRequieren">,
): Criterio[] {
  if (que !== "perfil" && !dimensionAplica(dimension, perfil)) return [];
  return nivel.criterios.filter((c) => cuentaElCriterio(c, que, perfil, requeridos));
}

/** Un eje por dimensión, en el orden de la escala (el de la matriz y el mapa). */
export function ejesDeLaTeoria(
  area: Pick<Area, "dimensiones">,
  perfil: Perfil,
  requeridos: Pick<RequeridosDelArea, "loRequieren">,
  que: QueSeCuenta,
): EjeDeLaTeoria[] {
  return area.dimensiones.map((d) => {
    const cuentas = Object.fromEntries(LETRAS.map((l) => [l, 0])) as Record<Letra, number>;
    for (const nv of d.niveles) cuentas[nv.letra] = criteriosDelCruce(d, nv, que, perfil, requeridos).length;
    return { dimensionId: d.id, nombre: d.nombre, capa: d.capa, aplica: dimensionAplica(d, perfil), cuentas };
  });
}
