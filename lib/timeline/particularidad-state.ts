/**
 * lib/timeline/particularidad-state.ts
 *
 * LA regla que separa una particularidad REAL de una SUGERENCIA. Puro y client-safe.
 *
 * `Particularidad.needsValidation` existe desde el diseño original ("propuesta sin confirmar")
 * pero durante meses NINGÚN read lo miró: todas las filas eran `false`, así que daba igual. En
 * el momento en que el equipo técnico pudo SUGERIR, dejó de dar igual — una fila sugerida que
 * viaje junto a las confirmadas suma su `weeksImpact` al corrimiento y se lee como un hecho
 * registrado. Es exactamente el bug de "13 semanas mostradas, 8 reales".
 *
 * Esta función es el único lugar donde se escribe esa separación, y su test la congela.
 */

/** Lo mínimo que hace falta para clasificar. */
export interface ValidationLike {
  needsValidation?: boolean | null;
}

/**
 * `true` si la fila es una particularidad CONFIRMADA (cuenta en semanas, resúmenes y —si
 * además es `visibleExternal`— en la vista del cliente).
 *
 * FAIL-OPEN a propósito para `undefined`/`null`: las filas históricas y los snapshots viejos no
 * traen el campo, y tratarlas como sugerencias las haría DESAPARECER de cronogramas ya
 * publicados. Solo un `true` explícito marca una sugerencia.
 */
export function esConfirmada(p: ValidationLike): boolean {
  return p.needsValidation !== true;
}

/** `true` si la fila es una SUGERENCIA pendiente de revisión del CSE. */
export function esSugerencia(p: ValidationLike): boolean {
  return p.needsValidation === true;
}

/**
 * Parte una lista en `confirmadas` (las de siempre) y `sugerencias` (las que esperan al CSE).
 * Preserva el orden dentro de cada grupo.
 */
export function partitionByValidation<T extends ValidationLike>(
  rows: T[],
): { confirmadas: T[]; sugerencias: T[] } {
  const confirmadas: T[] = [];
  const sugerencias: T[] = [];
  for (const r of rows) (esSugerencia(r) ? sugerencias : confirmadas).push(r);
  return { confirmadas, sugerencias };
}
