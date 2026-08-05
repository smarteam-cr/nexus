/**
 * lib/ui/text-search.ts — el filtrado por texto de las listas, en un solo lugar.
 *
 * Vivía adentro de `components/ui/Table.tsx` como una función privada, junto con el `useState`
 * del término. Eso tenía una consecuencia que no se ve leyendo el componente: **ninguna
 * pantalla del repo podía decir cuántas filas está mostrando**, porque el padre no tiene forma
 * de saber qué se filtró. Los contadores de las pestañas contaban el universo mientras la
 * tabla mostraba otra cosa, y no había manera de arreglarlo desde afuera.
 *
 * Sacarla acá es un refactor de cero comportamiento —`Table` la importa y hace exactamente lo
 * mismo— que habilita que un padre filtre por su cuenta y después pueda afirmar un número.
 */

/** Normaliza para búsqueda: sin acentos, minúsculas, sin espacios en los bordes. */
export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** ¿El texto contiene la consulta? Una consulta en blanco matchea todo. */
export function coincideBusqueda(texto: string, consulta: string): boolean {
  const q = normalizarTexto(consulta);
  if (!q) return true;
  return normalizarTexto(texto).includes(q);
}

/**
 * Filtra por texto.
 *
 * ⚠ Con la consulta en blanco devuelve **la misma referencia**, no una copia. Los consumidores
 * encadenan esto dentro de un `useMemo`: devolver un array nuevo en cada tecleo (incluso
 * cuando no hay nada que filtrar) invalidaría los memos de abajo sin ninguna razón.
 */
export function filtrarPorBusqueda<T>(
  filas: readonly T[],
  getText: (fila: T) => string,
  consulta: string,
): readonly T[] {
  const q = normalizarTexto(consulta);
  if (!q) return filas;
  return filas.filter((f) => normalizarTexto(getText(f)).includes(q));
}
