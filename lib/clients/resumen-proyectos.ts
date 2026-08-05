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
 * `DE_CARTERA` aplica `NO_ES_INTERNO`. Con ese criterio, el filtro «Con trabajo interno»
 * —el que motivó todo esto— daría **0 por construcción**, y las dos únicas empresas que
 * tienen trabajo interno caerían en «Sin proyecto abierto». `CLASIFICABLE` es el criterio
 * correcto porque un proyecto interno ES trabajo que estamos haciendo, aunque no se facture.
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
