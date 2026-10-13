/**
 * lib/casos-de-uso/en-la-preventa.ts — el catálogo de casos de uso dentro de la preventa. PURO.
 *
 * Un caso del catálogo elegido en una preventa se guarda con el id `cat-<id del catálogo>`: así no se confunde con
 * un caso libre del agente (`ia-…`) ni con una fila de la tabla `UseCase` (esa trae precio y entra a la propuesta
 * como `BusinessCaseUseCase`). El de `cat-` no tiene precio todavía (fase 2): entra a la propuesta como contexto,
 * con lo que el cliente obtiene. La nota interna del caso (`aviso`) nunca sale de acá.
 */
import { CATALOGO_DE_CASOS, casoPorId, type CasoDelCatalogo } from "./catalogo";

const PREFIJO = "cat-";

export function idEnLaPreventa(casoId: string): string {
  return `${PREFIJO}${casoId}`;
}

/** El caso del catálogo detrás de un id de la preventa, si lo es. */
export function casoDeLaPreventa(useCaseId: string): CasoDelCatalogo | undefined {
  return useCaseId.startsWith(PREFIJO) ? casoPorId(useCaseId.slice(PREFIJO.length)) : undefined;
}

/** Los casos que tocan alguna de las áreas en juego (los complementarios también: acompañan a cualquiera). */
export function casosParaLasAreas(areas: readonly string[]): CasoDelCatalogo[] {
  return CATALOGO_DE_CASOS.filter((c) => c.areas.some((a) => areas.includes(a)));
}

/** Las dimensiones que mueve el caso en un área (para guardarlas con el caso elegido). */
export function dimensionesEnElArea(caso: Pick<CasoDelCatalogo, "mueve">, areaId: string | null): string[] {
  return caso.mueve.filter((m) => !areaId || m.dimension.split(".")[0] === areaId).map((m) => m.dimension);
}

/**
 * El catálogo como lo lee el agente de casos: id, título, para qué área, el salto que da y cómo lo diría el cliente.
 * Sin la nota interna ni los servicios: lo que el agente escribe llega a la propuesta.
 */
export function catalogoParaElAgente(casos: readonly CasoDelCatalogo[]): string {
  return casos
    .map((c) => {
      const mueve = c.mueve.length ? c.mueve.map((m) => `${m.dimension} ${m.desde}→${m.hasta}`).join(", ") : "no mueve la escala";
      return `- [${c.id}] ${c.titulo}. ${c.promesa} Áreas: ${c.areas.join(", ")}. Mueve: ${mueve}. Lo dice así: ${c.sintomas.map((s) => `«${s}»`).join(" ")}`;
    })
    .join("\n");
}
