/**
 * lib/kickoff/ocultas-del-editor.ts
 *
 * Lo que el CSE tiene OCULTO en el editor del kickoff y todavía no subió al cliente. Puro y
 * client-safe; lo usan la ruta `kickoff-visibility`, el PDF y sus pruebas.
 *
 * ── POR QUÉ EXISTE (2026-10-20) ─────────────────────────────────────────────────────────────────
 * El ojo del kickoff era `staged`: el set vivía en el estado del navegador hasta «Subir al cliente»,
 * y recién ahí se escribía en `Project.hiddenKickoffKeys` (lo que lee el cliente). Valentina ocultaba
 * una sección, no subía, y al día siguiente la sección aparecía visible otra vez: al recargar, el
 * editor arrancaba del set PUBLICADO. Ni la regeneración ni el agente lo tocaban; simplemente nunca
 * se había guardado.
 *
 * Ahora hay DOS sets, cada uno en su lugar:
 *   · `Project.hiddenKickoffKeys` — lo que el CLIENTE no ve. Cambia solo al «Subir» (igual que antes).
 *   · la entry reservada `__ocultas` del Json `ProjectCanvas.sections` del kickoff — lo que el CSE
 *     tiene oculto en su canvas. Se guarda en cada clic del ojo. Sin SQL: el mismo contrato que
 *     `__doc` y `__cuestionarios` (el doble guion bajo dice «no soy una sección»).
 * La entry existe solo mientras el canvas difiere de lo publicado: «Subir» la borra.
 *
 * Las claves son las mismas de siempre (`kickoffHiddenKey`): el id de la sección, o «cronograma» /
 * «procesos» / el id de un proceso.
 */

export const CLAVE_OCULTAS_DEL_EDITOR = "__ocultas";

const esListaDeTexto = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** El set del canvas (la entry `__ocultas`), o `null` si no hay: el canvas está igual que lo publicado. */
export function ocultasDelBorrador(sections: unknown): string[] | null {
  if (!Array.isArray(sections)) return null;
  const e = sections.find(
    (x): x is Record<string, unknown> =>
      !!x && typeof x === "object" && (x as { key?: unknown }).key === CLAVE_OCULTAS_DEL_EDITOR,
  );
  return e && esListaDeTexto(e.claves) ? [...new Set(e.claves)] : null;
}

/**
 * El Json `sections` con la entry `__ocultas` reemplazada. `claves = null` la saca (al subir, o
 * cuando el canvas vuelve a coincidir con lo publicado). Toca SOLO esa entry.
 */
export function conOcultasDelBorrador(
  sections: unknown,
  claves: string[] | null,
  por: string | null,
  ahora: string,
): Array<Record<string, unknown>> {
  const resto = (Array.isArray(sections) ? sections : []).filter(
    (x): x is Record<string, unknown> =>
      !!x && typeof x === "object" && (x as { key?: unknown }).key !== CLAVE_OCULTAS_DEL_EDITOR,
  );
  if (claves === null) return resto;
  // `label` igual que `__doc` y `__cuestionarios`: toda entry del Json lleva key y label.
  return [
    ...resto,
    { key: CLAVE_OCULTAS_DEL_EDITOR, label: CLAVE_OCULTAS_DEL_EDITOR, claves: [...new Set(claves)].sort(), en: ahora, por },
  ];
}

/** Lo que el EDITOR muestra oculto: su borrador si lo tiene; si no, lo publicado. */
export function ocultasEnElEditor(publicadas: readonly string[], borrador: readonly string[] | null): string[] {
  return [...new Set(borrador ?? publicadas)];
}

/** `true` si los dos sets tienen las mismas claves (el orden no importa). */
export function mismasOcultas(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((k) => sb.has(k));
}
