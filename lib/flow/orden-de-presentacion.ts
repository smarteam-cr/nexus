/**
 * lib/flow/orden-de-presentacion.ts — EN QUÉ ORDEN SE LISTAN LAS PIEZAS EN PANTALLA. PURO.
 *
 * ── POR QUÉ NO ALCANZABA CON `piecesInFlowOrder` ─────────────────────────────
 * Hasta hoy el desplegable del proyecto se ordenaba con el orden NARRATIVO del ciclo de
 * vida (`lib/flow/stage-pieces.ts`): el que declara que EXPLORACION viene antes que
 * DIAGNOSTICO y que el cronograma pertenece a PLANIFICACION. Ése orden es correcto como
 * modelo del servicio y tiene que quedarse como está — lo consumen el manual y el motor de
 * etapas, y moverlo renumera el ciclo entero.
 *
 * Pero el orden en el que se MODELA un servicio y el orden en el que se TRABAJA no son el
 * mismo (Elías, 2026-09-27). El cronograma se abre todos los días de un proyecto, en
 * cualquier etapa: tenerlo cuarto —detrás de tres documentos que se escriben una vez— es
 * ordenar el menú por la teoría en vez de por el uso.
 *
 * Así que son DOS listas, a propósito, y cada una responde a su pregunta:
 *
 *   · `piecesInFlowOrder` (stage-pieces) → «¿en qué orden OCURRE el servicio?»
 *   · `ORDEN_DE_PRESENTACION` (este archivo) → «¿en qué orden lo MUESTRO?»
 *
 * ⚠ La trampa evidente de tener dos listas es que la segunda se quede vieja: alguien agrega
 * una pieza al flujo, se olvida de acá, y esa pieza **desaparece del menú sin que nada
 * falle**. Dos cosas lo impiden, y hacen falta las dos: `ordenarParaPresentacion` manda al
 * final lo que no reconoce (nunca se pierde), y `orden-de-presentacion.test.ts` exige que
 * las dos listas tengan exactamente los mismos slugs (nunca queda al final en silencio).
 */
import { piecesInFlowOrder } from "./stage-pieces";

/**
 * El orden del MENÚ del proyecto, decidido por negocio (Elías, 2026-09-27).
 *
 * El handoff va primero cuando se pide —es la base de la que sale todo lo demás—, aunque el
 * desplegable no lo liste (tiene su lugar propio en el Resumen). Después el CRONOGRAMA, que
 * es la pantalla que más se abre. Y recién ahí el recorrido documental en su orden natural,
 * con Implementación antes que Integraciones: la primera le toca a todo proyecto y la
 * segunda solo a los que tienen alcance técnico.
 */
export const ORDEN_DE_PRESENTACION: readonly string[] = [
  "handoff",
  "timeline",
  "kickoff",
  "exploration",
  "diagnosis",
  "planning",
  "implementation",
  "tech-requirements",
  "delivery",
];

const INDICE = new Map(ORDEN_DE_PRESENTACION.map((slug, i) => [slug, i]));

/**
 * Ordena slugs de piezas para MOSTRARLOS. Estable, y lo desconocido va al final en el orden
 * en que llegó — una pieza nueva sin declarar se ve mal ubicada, que es infinitamente mejor
 * que no verse.
 */
export function ordenarParaPresentacion<T>(items: T[], slugDe: (item: T) => string): T[] {
  const FINAL = ORDEN_DE_PRESENTACION.length;
  return items
    .map((item, i) => ({ item, i, orden: INDICE.get(slugDe(item)) ?? FINAL }))
    .sort((a, b) => a.orden - b.orden || a.i - b.i)
    .map((x) => x.item);
}

/** Las piezas del flujo completo, en orden de PRESENTACIÓN. */
export function piezasParaMostrar(): string[] {
  return ordenarParaPresentacion([...piecesInFlowOrder("full")], (s) => s);
}
