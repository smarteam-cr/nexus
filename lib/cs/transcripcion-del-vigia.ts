/**
 * lib/cs/transcripcion-del-vigia.ts — cuánto de una TRANSCRIPCIÓN lee el agente vigía (2026-10-05). PURO.
 *
 * Pedido de Elías: «que también analice las sesiones internas donde se habló del cliente». El vigía
 * ya listaba las reuniones internas atribuidas al cliente, pero solo leía su minuta, y la mayoría no
 * la tiene (medido el 2026-10-05: de 95 internas del último mes y medio, 29 con minuta y 33 con
 * transcripción). Desde ahora una reunión SIN minuta pero CON transcripción —interna o con el
 * cliente— entra con un extracto. Si tiene minuta, manda la minuta: la transcripción no se lee.
 *
 * ── LOS TOPES, Y POR QUÉ ─────────────────────────────────────────────────────
 * El vigía corre sobre toda la cartera y una transcripción de una hora pasa los 40.000 caracteres.
 * Por eso dos topes, en caracteres:
 *  · por reunión, `TOPE_POR_REUNION` (1.200): el principio (para qué se juntaron) y el final (en qué
 *    quedaron); el medio se corta con «[…]».
 *  · por bloque, el que pasa quien llama: `TOPE_TRANSCRIPCION_CUENTA` (4.800) para las reuniones de la
 *    cuenta y `TOPE_TRANSCRIPCION_PROYECTO` (2.400) para las del proyecto. Se reparte de la más nueva
 *    a la más vieja; cuando se acaba, las que siguen van sin extracto.
 * En el peor caso son 7.200 caracteres más por corrida, unos 2.000 tokens de entrada: del orden de
 * medio centavo de dólar con el modelo del vigía. Subir un tope es subir ese número en cada corrida.
 */

/** Lo más que se lee de UNA transcripción. */
export const TOPE_POR_REUNION = 1_200;
/** Lo más que se lee de transcripciones en el bloque de reuniones de la CUENTA (lib/cs/watchdog-cuenta.ts). */
export const TOPE_TRANSCRIPCION_CUENTA = 4_800;
/** Lo más que se lee de transcripciones en el bloque de reuniones del PROYECTO (lib/cs/watchdog-context.ts). */
export const TOPE_TRANSCRIPCION_PROYECTO = 2_400;
/** Con menos que esto un extracto no dice nada: el bloque se corta ahí. */
const MINIMO_UTIL = 200;
const CORTE = " […] ";

/** El extracto de una transcripción en `tope` caracteres: el principio y el final, sin el medio. */
export function extractoDeTranscripcion(texto: string, tope: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (!limpio || tope <= 0) return "";
  if (limpio.length <= tope) return limpio;
  const util = tope - CORTE.length;
  if (util <= 0) return limpio.slice(0, tope);
  // Más del principio que del final: el principio dice de qué se habló; el final, en qué quedaron.
  const inicio = Math.ceil(util * 0.6);
  return `${limpio.slice(0, inicio)}${CORTE}${limpio.slice(limpio.length - (util - inicio))}`;
}

/** Una reunión del bloque, en el orden en que se lista (la más nueva primero). */
export interface ReunionParaExtracto {
  id: string;
  /** true = tiene minuta con resumen: no se lee su transcripción. */
  tieneMinuta: boolean;
  transcript: string | null;
}

/**
 * El extracto de cada reunión SIN minuta y con transcripción, dentro del tope del bloque. Devuelve
 * solo las que llevan extracto, por id. La suma de los extractos nunca pasa `topeDelBloque`.
 */
export function extractosDelBloque(
  reuniones: readonly ReunionParaExtracto[],
  topeDelBloque: number,
  topePorReunion: number = TOPE_POR_REUNION,
): Map<string, string> {
  const out = new Map<string, string>();
  let queda = topeDelBloque;
  for (const r of reuniones) {
    if (queda < MINIMO_UTIL) break;
    if (r.tieneMinuta || !r.transcript?.trim()) continue;
    const extracto = extractoDeTranscripcion(r.transcript, Math.min(topePorReunion, queda));
    if (!extracto) continue;
    out.set(r.id, extracto);
    queda -= extracto.length;
  }
  return out;
}
