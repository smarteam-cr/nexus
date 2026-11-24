/**
 * lib/canvas/guardados-en-fila.ts — los guardados de un MISMO bloque salen en fila, en el orden en que
 * se hicieron.
 *
 * ── EL FALLO QUE LO TRAE ─────────────────────────────────────────────────────────────────────
 * Juan Carlos Armijos (CSE), 24 nov, en «Sesiones y horarios» del kickoff: «no me permite cambiar lo
 * que escribo» y «cuando le pongo agregar, siempre me agrega la primera». Reproducido con la latencia
 * irregular de la red: dos «+ Agregar franja» seguidos mandan dos PUT con el bloque ENTERO (una franja,
 * después dos). Si el segundo llega al servidor antes que el primero, el primero lo pisa y la base
 * queda con UNA franja. La relectura de después trae esa franja sola, el borrador del editor se
 * re-siembra, y lo que el CSE estaba escribiendo se borra.
 *
 * Los editores del motor guardan el `data` ENTERO del bloque (no un parche), así que entre dos PUT
 * del mismo bloque gana el que llega último, no el que se hizo último. Con la fila, el segundo sale
 * cuando el primero ya volvió: el servidor los recibe en el orden de la pantalla.
 *
 * ── Y POR QUÉ DEVUELVE `vieneOtro` ───────────────────────────────────────────────────────────
 * Cada guardado relee el canvas al volver. Si detrás viene otro guardado del mismo bloque, esa
 * relectura puede leer la base ANTES de que el siguiente aterrice y pintar por un momento lo viejo
 * (con la re-siembra del borrador, eso también borra lo que se está escribiendo). La relectura la
 * hace solo el último de la fila: el que ve lo que de verdad quedó.
 *
 * Bloques distintos no se esperan entre sí.
 */

/**
 * Cuánto espera «Subir al cliente» (y el chat antes de releer) a los guardados pendientes.
 *
 * Antes eran 5 s en TOTAL, pensados para un fetch colgado. Con la fila, los guardados de un bloque
 * salen de a uno y sus tiempos se SUMAN: cinco casillas seguidas en una red lenta pasan los 5 s sin
 * que nada esté colgado, y se publicaba sin los últimos cambios. Ahora el corte es por QUIETUD: se
 * sigue esperando mientras la cuenta baje, y se corta tras 5 s sin que baje nada (un fetch colgado)
 * o a los 30 s en total.
 */
export const ESPERA_SIN_AVANCE_MS = 5_000;
export const ESPERA_MAXIMA_MS = 30_000;

export function sigueEsperando(pendientes: number, msSinAvance: number, msEnTotal: number): boolean {
  return pendientes > 0 && msSinAvance < ESPERA_SIN_AVANCE_MS && msEnTotal < ESPERA_MAXIMA_MS;
}

export interface ResultadoEnFila<T> {
  valor: T;
  /** `true` si, cuando esta tarea terminó, ya había otra del mismo bloque esperando detrás. */
  vieneOtro: boolean;
}

export type EncolarGuardado = <T>(clave: string, tarea: () => Promise<T>) => Promise<ResultadoEnFila<T>>;

/**
 * Una fila por clave (el id del bloque). La tarea de una clave arranca cuando terminó la anterior
 * de la MISMA clave, haya salido bien o mal: un guardado que falla no traba los que vienen.
 */
export function crearFilaDeGuardados(): EncolarGuardado {
  /* El último turno de cada clave. Un turno siempre se resuelve (nunca se rechaza), así que esperar
     al anterior nunca lanza, aunque su tarea haya fallado. */
  const ultimos = new Map<string, Promise<void>>();

  return async function encolar<T>(clave: string, tarea: () => Promise<T>): Promise<ResultadoEnFila<T>> {
    const anterior = ultimos.get(clave);
    let liberar!: () => void;
    const turno = new Promise<void>((r) => {
      liberar = r;
    });
    ultimos.set(clave, turno);
    try {
      if (anterior) await anterior;
      const valor = await tarea();
      return { valor, vieneOtro: ultimos.get(clave) !== turno };
    } finally {
      if (ultimos.get(clave) === turno) ultimos.delete(clave);
      liberar();
    }
  };
}
