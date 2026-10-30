/**
 * lib/artefactos/contexto-de-la-copia.ts — LO QUE ES DE CADA COPIA y no de su tipo (etapa V3b de docs/artefactos-plan.md;
 * Elías, 30 oct: «el contexto adicional es por artefacto»). PURO: lo usan el servidor y la pantalla.
 *
 *   · Las reuniones elegidas viven en la entry `__contexto` del Json `ProjectCanvas.sections`, como las instrucciones
 *     (`__doc`) y la plantilla (`__plantilla`): sin DDL, y al duplicar pasan solas.
 *   · Las notas, los archivos y las transcripciones pegadas son `NotaDeContexto` con la pieza `copia-<canvasId>`.
 *   · Las secciones de la plantilla que alguien borró viven en la entry `__quitadas`: regenerar no las devuelve.
 *
 * El documento de siempre de cada tipo sigue con sus columnas de `SessionProject` y su pieza: nada de esto lo toca.
 */

export const CLAVE_DEL_CONTEXTO = "__contexto";
export const CLAVE_DE_LAS_QUITADAS = "__quitadas";
/** Las reuniones que se pueden elegir: más no entran al documento (lib/contexto/documento.ts, MAX_ELEGIDAS_A_LEER). */
export const TOPE_DE_REUNIONES_DE_LA_COPIA = 40;
const PREFIJO_DE_LA_NOTA = "copia-";

type Entry = Record<string, unknown>;

const entradas = (sections: unknown): Entry[] => (Array.isArray(sections) ? sections.filter((x): x is Entry => !!x && typeof x === "object") : []);

/** La pieza con que se guardan las notas de una copia. */
export function piezaDeLasNotas(canvasId: string): string {
  return `${PREFIJO_DE_LA_NOTA}${canvasId}`;
}

/** El canvas de una pieza de notas. null = es la pieza de un documento de siempre. */
export function canvasDeLaPieza(pieza: string): string | null {
  return pieza.startsWith(PREFIJO_DE_LA_NOTA) ? pieza.slice(PREFIJO_DE_LA_NOTA.length) || null : null;
}

function idsDe(sections: unknown, clave: string, campo: string): string[] {
  const v = entradas(sections).find((e) => e.key === clave)?.[campo];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** El Json con la entry reemplazada. Toca SOLO esa entry. `label` como toda entry: lo exige `parseSectionEntries`. */
function conEntry(sections: unknown, clave: string, campo: string, valor: string[]): Entry[] {
  return [...entradas(sections).filter((e) => e.key !== clave), { key: clave, label: clave, [campo]: valor }];
}

export function reunionesDeLaCopia(sections: unknown): string[] {
  return idsDe(sections, CLAVE_DEL_CONTEXTO, "reuniones");
}

export function conReunionesDeLaCopia(sections: unknown, reuniones: readonly string[]): Entry[] {
  return conEntry(sections, CLAVE_DEL_CONTEXTO, "reuniones", [...new Set(reuniones)].slice(0, TOPE_DE_REUNIONES_DE_LA_COPIA));
}

export function seccionesQuitadas(sections: unknown): Set<string> {
  return new Set(idsDe(sections, CLAVE_DE_LAS_QUITADAS, "keys"));
}

export function conSeccionQuitada(sections: unknown, key: string): Entry[] {
  return conEntry(sections, CLAVE_DE_LAS_QUITADAS, "keys", [...seccionesQuitadas(sections), key]);
}
