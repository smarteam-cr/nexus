/**
 * lib/landing/reordenar.ts — reordenar UNA PARTE de una lista sin mover lo demás. PURO.
 *
 * Los objetivos del diagnóstico se guardan en una sola lista y se pintan en dos grupos (cuantitativos y cualitativos).
 * Arrastrar dentro de un grupo (L3 etapa 2 del roadmap, 2026-10-24) tiene que cambiar el orden de ESE grupo y dejar cada
 * objetivo del otro grupo en el lugar que tenía.
 */

/**
 * LA LISTA EN EL ORDEN DE `indices` (posiciones de `lista`), y al final, en su orden, las que `indices` no nombra (L3 etapa
 * 2: la cuarta columna del problema reordena la tabla de Acciones, y esa columna no muestra las acciones vacías). Un
 * índice repetido o fuera de la lista se ignora: nunca pierde ni duplica un ítem.
 */
export function reordenarPorIndices<T>(lista: readonly T[], indices: readonly number[]): T[] {
  const usados = new Set<number>();
  const primero: T[] = [];
  for (const i of indices) {
    if (!Number.isInteger(i) || i < 0 || i >= lista.length || usados.has(i)) continue;
    usados.add(i);
    primero.push(lista[i]);
  }
  return [...primero, ...lista.filter((_, i) => !usados.has(i))];
}

/**
 * `lugares`: las posiciones (en `lista`) de los ítems del grupo, en su orden de antes. `nuevoOrden`: esas mismas
 * posiciones en el orden nuevo. Devuelve la lista con los ítems del grupo en el orden nuevo, ocupando los mismos lugares.
 * Si `nuevoOrden` no es una permutación de `lugares`, devuelve la lista tal cual (nunca pierde ni duplica un ítem).
 */
export function reordenarEnSusLugares<T>(lista: readonly T[], lugares: readonly number[], nuevoOrden: readonly number[]): T[] {
  const a = [...lugares].sort((x, y) => x - y);
  const b = [...nuevoOrden].sort((x, y) => x - y);
  if (a.length !== b.length || a.some((v, i) => v !== b[i] || v < 0 || v >= lista.length)) return [...lista];
  const out = [...lista];
  lugares.forEach((lugar, k) => {
    out[lugar] = lista[nuevoOrden[k]];
  });
  return out;
}
