/**
 * lib/asistente/desenlace.ts — QUÉ QUEDÓ ESCRITO EN EL HILO CUANDO SE APRETÓ «APLICAR».
 *
 * El desenlace es un turno más del asistente, no una columna de estado: así lo lee la persona al
 * releer la conversación Y lo lee el modelo en el turno siguiente. Este módulo tiene las partes
 * PURAS de ese texto, para poder probarlas sin base y sin navegador.
 */

/** Cuántas líneas descartadas se nombran antes de resumir. Más que esto es un párrafo, no un aviso. */
export const LINEAS_NOMBRADAS = 3;

/** Recorte por línea: las traducciones largas rondan los 120 caracteres y el detalle tiene tope. */
const LARGO_DE_LINEA = 100;

const recortar = (s: string): string =>
  s.length > LARGO_DE_LINEA ? s.slice(0, LARGO_DE_LINEA - 1).trimEnd() + "…" : s;

/**
 * ⭐ EL DESENLACE NOMBRA LO QUE QUEDÓ AFUERA, no lo cuenta.
 *
 * Antes decía «Se aplicaron 3 de 5 cambios: el resto se descartó» — un número. Y el número no
 * alcanza por dos motivos distintos:
 *
 * 1. La PERSONA vuelve al hilo tres días después y no tiene forma de saber qué eran esos dos.
 * 2. El MODELO lee el hilo. Con un conteo sabe que faltan dos y no cuáles, así que al proponer de
 *    nuevo tiene que adivinar entre repetir algo ya aplicado —que duplicaría, porque el
 *    vocabulario no es idempotente— y repetir algo que la persona descartó a propósito.
 *
 * ⚠ Se numeran con el MISMO número que tenían en la cajita azul: es lo que la persona acaba de
 * leer, y es lo que le permite decir «volvé a poner la 4» en el turno siguiente.
 *
 * @param lineas      la lista COMPLETA del acuerdo, en el orden en que se pintó
 * @param descartadas los índices que la persona desmarcó
 */
export function notaDeDescarte(
  lineas: readonly string[],
  descartadas: readonly number[],
): string {
  const fuera = [...new Set(descartadas)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < lineas.length)
    .sort((a, b) => a - b);
  if (fuera.length === 0) return "";

  const nombradas = fuera
    .slice(0, LINEAS_NOMBRADAS)
    .map((i) => `${i + 1}. ${recortar(lineas[i])}`)
    .join(" · ");
  const resto = fuera.length - LINEAS_NOMBRADAS;

  return (
    `Quedó sin aplicar ${fuera.length === 1 ? "1 cambio" : `${fuera.length} cambios`}: ` +
    nombradas +
    (resto > 0 ? ` y ${resto} más` : "") +
    ". Si los necesitas, pídemelos de nuevo."
  );
}
