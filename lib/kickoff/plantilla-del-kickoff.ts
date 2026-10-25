/**
 * lib/kickoff/plantilla-del-kickoff.ts — QUÉ SE OCULTA DEL KICKOFF AL CAMBIAR DE PLANTILLA (M1 del roadmap, 2026-10-25).
 * PURO.
 *
 * El kickoff no oculta como los demás documentos: su ojo vive en dos sets (lib/kickoff/ocultas-del-editor.ts) — el del
 * editor (`__ocultas` del Json del canvas, sin subir) y el del cliente (`Project.hiddenKickoffKeys`, al «Subir»). Marcar
 * `hidden` en las entradas del Json, como hace el diagnóstico, es mudo acá: el editor, el «Subir» y el enlace del cliente
 * no lo leen (lo encontró la revisión del 25 oct). Por eso, al generar con otra plantilla:
 *   · lo de afuera de la plantilla CON contenido se oculta EN EL EDITOR (entra al set del borrador); el cliente deja de
 *     verlo cuando alguien toca «Subir», como cualquier otro cambio del kickoff;
 *   · lo de adentro que ocultó una plantilla anterior vuelve a verse; lo que ocultó una persona, no;
 *   · lo de afuera vacío lo borra quien llama (no hace falta ocultarlo).
 * Lo que ocultó la plantilla se recuerda en la entry `__ocultasPorLaPlantilla` del Json (mismo contrato que `__ocultas`).
 */

export const CLAVE_OCULTAS_POR_LA_PLANTILLA = "__ocultasPorLaPlantilla";

/** Las claves que ocultó una plantilla (la entry reservada), o [] si no hay. */
export function ocultasPorLaPlantilla(sections: unknown): string[] {
  if (!Array.isArray(sections)) return [];
  const e = sections.find(
    (x): x is Record<string, unknown> => !!x && typeof x === "object" && (x as { key?: unknown }).key === CLAVE_OCULTAS_POR_LA_PLANTILLA,
  );
  return e && Array.isArray(e.claves) ? e.claves.filter((c): c is string => typeof c === "string") : [];
}

/** El Json con la entry reemplazada (vacía = se saca). Toca SOLO esa entry. */
export function conOcultasPorLaPlantilla(sections: unknown, claves: readonly string[]): Array<Record<string, unknown>> {
  const resto = (Array.isArray(sections) ? sections : []).filter(
    (x): x is Record<string, unknown> => !!x && typeof x === "object" && (x as { key?: unknown }).key !== CLAVE_OCULTAS_POR_LA_PLANTILLA,
  );
  if (!claves.length) return resto;
  return [...resto, { key: CLAVE_OCULTAS_POR_LA_PLANTILLA, label: CLAVE_OCULTAS_POR_LA_PLANTILLA, claves: [...new Set(claves)].sort() }];
}

/** Una fila del canvas del kickoff, para decidir qué se borra al cambiar de plantilla. */
export interface FilaDelKickoff {
  id: string;
  key: string;
  bloques: number;
  /** `true` para cronograma y procesos: no tienen bloques pero muestran lo del proyecto. */
  ctx: boolean;
}

/**
 * Cuáles de las secciones del canon que la plantilla no tiene se BORRAN (vacías) y cuáles se ocultan (con algo). Solo las
 * del canon: una creada por una persona (`custom:*`) o una retirada nunca se toca. Las ctx nunca se borran.
 */
export function fueraDeLaPlantilla(
  filas: readonly FilaDelKickoff[],
  deLaPlantilla: ReadonlySet<string>,
  delCanon: ReadonlySet<string>,
): { borrar: FilaDelKickoff[]; ocultar: FilaDelKickoff[] } {
  const fuera = filas.filter((f) => delCanon.has(f.key) && !deLaPlantilla.has(f.key));
  const conAlgo = (f: FilaDelKickoff) => f.bloques > 0 || f.ctx;
  return { borrar: fuera.filter((f) => !conAlgo(f)), ocultar: fuera.filter(conAlgo) };
}

export interface SeccionDelKickoff {
  key: string;
  /** La clave del ojo (`kickoffHiddenKey`: el id de la sección, o «cronograma» / «procesos»). */
  claveDelOjo: string;
}

/**
 * El set del editor después de generar con una plantilla. `fueraConAlgo`: las secciones de afuera de la plantilla que
 * tienen contenido (se ocultan); `adentro`: las de la plantilla (vuelven si las había ocultado una plantilla).
 */
export function ocultasSegunLaPlantilla(o: {
  ocultasDelEditor: readonly string[];
  porLaPlantillaAntes: readonly string[];
  fueraConAlgo: readonly SeccionDelKickoff[];
  adentro: readonly SeccionDelKickoff[];
}): { ocultas: string[]; porLaPlantilla: string[] } {
  const ocultas = new Set(o.ocultasDelEditor);
  const antes = new Set(o.porLaPlantillaAntes);
  const porLaPlantilla = new Set<string>();
  for (const s of o.adentro) {
    if (antes.has(s.claveDelOjo)) ocultas.delete(s.claveDelOjo);
  }
  for (const s of o.fueraConAlgo) {
    // Una que ya estaba oculta por una persona queda como estaba (y no pasa a ser «de la plantilla»).
    if (ocultas.has(s.claveDelOjo) && !antes.has(s.claveDelOjo)) continue;
    /* Una que ocultó la plantilla y una persona volvió a mostrar con el ojo: se respeta (la segunda revisión, 25 oct).
       Regenerar no la vuelve a ocultar, y deja de ser «de la plantilla». */
    if (antes.has(s.claveDelOjo) && !o.ocultasDelEditor.includes(s.claveDelOjo)) continue;
    ocultas.add(s.claveDelOjo);
    porLaPlantilla.add(s.claveDelOjo);
  }
  return { ocultas: [...ocultas].sort(), porLaPlantilla: [...porLaPlantilla].sort() };
}
