/**
 * lib/timeline/particularidad-state.ts
 *
 * LOS DOS EJES de una particularidad, en un solo lugar. Puro y client-safe.
 *
 *   · `needsValidation` → ¿es un HECHO o una PROPUESTA del agente?  (`esConfirmada`)
 *   · `estado`          → ¿sigue VIGENTE o ya se resolvió?          (`esAbierta`)
 *
 * Son independientes: una fila puede ser un hecho confirmado y estar cerrada.
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

/* ═══════════════════════════════════════════════════════════════════════════════════════
 * ¿SIGUE VIGENTE? — el segundo eje, y NO es lo mismo que el primero
 *
 * `needsValidation` responde «¿esto es un hecho o una propuesta?». `estado` responde «¿esto
 * sigue pasando?». Una fila puede ser un hecho confirmado Y estar resuelta.
 *
 * ⛔ LA CONFUSIÓN QUE ESTE BLOQUE EXISTE PARA IMPEDIR: cerrar NO resta semanas. Un atraso de
 * 3 semanas que se resolvió movió el calendario 3 semanas igual — el Gantt ya está corrido y
 * cerrarlo no lo devuelve. Si `totalWeeks` dejara de contarlo, la publicación al cliente diría
 * que el plan se movió menos de lo que se movió, con el Gantt corrido al lado contradiciéndola.
 * Lo que se apaga al cerrar es la ACCIÓN: dejar de perseguir el compromiso, dejar de pedir las
 * semanas que faltan, dejar de aparecer en «qué hacer acá».
 * ═══════════════════════════════════════════════════════════════════════════════════════ */

/** Lo mínimo para saber si sigue vigente. */
export interface EstadoLike {
  estado?: string | null;
}

/**
 * `true` si la desviación sigue VIGENTE.
 *
 * FAIL-OPEN para `undefined`, y acá el motivo es distinto del de `esConfirmada`: la columna es
 * NOT NULL con default, así que la BASE nunca devuelve nulo. Lo que sí llega sin el campo son
 * los SNAPSHOTS publicados antes de este cambio, que se leen tal cual quedaron congelados.
 * Tratarlos como cerrados haría desaparecer la bitácora de todo cronograma ya entregado.
 */
export function esAbierta(p: EstadoLike): boolean {
  return p.estado !== "CERRADA";
}

/** `true` si la desviación ya se resolvió. Su registro y sus semanas se conservan. */
export function esCerrada(p: EstadoLike): boolean {
  return p.estado === "CERRADA";
}

/**
 * Parte una lista en `abiertas` y `cerradas`, preservando el orden dentro de cada grupo.
 * Mismo molde que `partitionByValidation` — los dos ejes se preguntan igual.
 */
export function partitionByEstado<T extends EstadoLike>(
  rows: T[],
): { abiertas: T[]; cerradas: T[] } {
  const abiertas: T[] = [];
  const cerradas: T[] = [];
  for (const r of rows) (esCerrada(r) ? cerradas : abiertas).push(r);
  return { abiertas, cerradas };
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
