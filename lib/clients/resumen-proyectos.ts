/**
 * lib/clients/resumen-proyectos.ts — QUÉ TIENE una empresa, en tres números.
 *
 * El índice de clientes filtra por lo que la empresa TIENE (proyectos abiertos, trabajo
 * interno). Ese cálculo vive acá y no adentro del componente por dos razones concretas:
 *
 * 1. **El criterio de "proyecto que cuenta" NO se escribe acá.** Se importa
 *    `esProyectoClasificable` de `lib/projects/scope.ts`. Copiar el par
 *    `status === "active" && serviceType !== "__strategy__"` sería una copia más del bug que
 *    ese archivo existe para matar: la versión SQL descartaba los NULL y la de JS no, así que
 *    un proyecto podía ser pestaña inicial sin existir en el rail.
 *
 * 2. **Al browser viajan los tres números, no los N proyectos.** La frontera server→client
 *    de esta pantalla ya cruza ~16 campos por cada una de las 165 filas.
 *
 * ── POR QUÉ *CLASIFICABLE* Y NO *DE CARTERA* ─────────────────────────────────
 * `DE_CARTERA` aplica `NO_ES_INTERNO`. Con ese criterio el contador `internos` daría **0 por
 * construcción** —y con él la pestaña «Proyectos internos», que sale de acá— y las empresas
 * con trabajo de puertas adentro caerían en «Sin proyecto abierto». `CLASIFICABLE` es el
 * criterio correcto porque un proyecto interno ES trabajo que estamos haciendo, aunque no se
 * facture.
 *
 * ⚠ El chip «Con trabajo interno» que motivó esto ya no existe: se retiró cuando la pestaña
 * «Proyectos internos» pasó a listar los proyectos, que es lo que la persona venía a buscar.
 * El criterio se queda igual porque el contador sigue alimentando esa pestaña.
 *
 * ⚠ El precio, declarado: esta pantalla va a decir 43 donde Éxito del cliente muestra 40 y
 * Cobranza otro número. Los tres son correctos y responden preguntas distintas — por eso el
 * tooltip de la píldora lo dice en pantalla, en vez de dejar que alguien "alinee" los números
 * dentro de seis meses y apague el filtro sin darse cuenta.
 */
import { esProyectoClasificable, type ProyectoParaFiltro } from "@/lib/projects/scope";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";

/** Los proyectos de UN cliente, resumidos. Se calcula en el server y cruza como 3 escalares. */
export interface ResumenDeProyectos {
  /** Abiertos y de verdad — es el valor de la columna "Proyectos". */
  abiertos: number;
  /** Reales pero cerrados o pausados. Solo alimenta el `title` de esa columna. */
  cerrados: number;
  /** De los ABIERTOS, cuántos están marcados «Proyecto interno» en HubSpot. */
  internos: number;
}

export const RESUMEN_VACIO: ResumenDeProyectos = { abiertos: 0, cerrados: 0, internos: 0 };

export function resumirProyectos(
  proyectos: readonly ProyectoParaFiltro[],
): ResumenDeProyectos {
  let abiertos = 0;
  let cerrados = 0;
  let internos = 0;

  for (const p of proyectos) {
    // El contenedor "Información del cliente" no es un proyecto: no cuenta ni como abierto
    // ni como cerrado. Si contara como cerrado, las empresas que solo lo tienen dirían
    // "0 abiertos · 1 cerrado" y parecería que perdieron un proyecto. Hoy `_count` los
    // cuenta como proyectos y por eso hay fichas que muestran "1" teniendo cero.
    if (p.serviceType === SENTINEL_SERVICE_TYPE) continue;

    if (esProyectoClasificable(p)) {
      abiertos++;
      if (esTrabajoInterno(p)) internos++;
    } else {
      cerrados++;
    }
  }

  return { abiertos, cerrados, internos };
}

export const estaEnEjecucion = (r: ResumenDeProyectos): boolean => r.abiertos > 0;

/**
 * ⚠ SIN CONSUMIDOR EN PRODUCCIÓN, a propósito. Su chip —«Con trabajo interno»— se retiró
 * cuando la pestaña «Proyectos internos» pasó a listar los proyectos, que es lo que la persona
 * venía a buscar. Se conserva porque es el predicado que da nombre al contador `internos` y su
 * test lo congela: si vuelve a hacer falta un filtro por trabajo interno, la regla ya está
 * escrita una sola vez y no se va a re-derivar a mano en la pantalla, que es como nacieron las
 * cuatro copias que este módulo vino a borrar.
 */
export const tieneTrabajoInterno = (r: ResumenDeProyectos): boolean => r.internos > 0;

/**
 * ¿Este proyecto es trabajo de puertas adentro?
 *
 * Un solo criterio para las dos cosas que lo preguntan: el contador `internos` del resumen y
 * la pestaña «Proyectos internos» del índice. Si se escribieran aparte, el día que difieran la
 * pestaña mostraría N filas y el tooltip de la fila diría otro número.
 *
 * La fuente es `proyectoInterno`, que llega de HubSpot y tiene escritor único (el espejo).
 */
export const esTrabajoInterno = (p: ProyectoParaFiltro): boolean =>
  esProyectoClasificable(p) && p.proyectoInterno;

/**
 * Los proyectos que cuentan como ABIERTOS: el mismo criterio que `abiertos`, devolviendo las
 * filas. El índice saca de acá la línea de nombres, la etapa y los avisos de «Necesitan atención»
 * (2026-10-04), para que ninguno pueda filtrar distinto que la columna y el filtro.
 */
export function proyectosAbiertos<P extends ProyectoParaFiltro>(proyectos: readonly P[]): P[] {
  return proyectos.filter((p) => p.serviceType !== SENTINEL_SERVICE_TYPE && esProyectoClasificable(p));
}

/**
 * Los NOMBRES de los proyectos abiertos, en orden alfabético estable. Es la línea de abajo del
 * nombre de la empresa en el índice (rediseño del 2026-10-04): dice QUÉ se está haciendo, que es
 * lo que el número de la columna vieja no decía.
 *
 * Mismo criterio que `abiertos` —escrito una vez, arriba— para que la línea y el filtro «Con
 * proyecto abierto» no puedan contar historias distintas. Va como función aparte y no como campo
 * del resumen: el resumen cruza como tres escalares y sus tests lo comparan entero.
 */
export function nombresAbiertos(proyectos: readonly (ProyectoParaFiltro & { name: string })[]): string[] {
  return proyectosAbiertos(proyectos)
    .map((p) => p.name.trim())
    .filter((n) => n.length > 0)
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

/** El `title` de la columna "Proyectos". Dice lo que el número NO muestra. */
export function tituloDeProyectos(r: ResumenDeProyectos): string {
  const partes: string[] = [];
  partes.push(r.abiertos === 1 ? "1 abierto" : `${r.abiertos} abiertos`);
  if (r.cerrados > 0) partes.push(r.cerrados === 1 ? "1 cerrado" : `${r.cerrados} cerrados`);
  if (r.internos > 0) {
    partes.push(r.internos === 1 ? "1 es interno" : `${r.internos} son internos`);
  }
  return partes.join(" · ");
}
