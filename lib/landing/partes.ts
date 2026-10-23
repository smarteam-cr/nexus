/**
 * lib/landing/partes.ts — LAS PIEZAS DE UNA SECCIÓN: en qué orden van y cuáles se quitaron. PURO (lo usan el motor y
 * sus pruebas).
 *
 * Elías (2026-10-23, el diagnóstico de CEMACO): «el subtítulo y la intro no tienen la X ni la manija para moverse».
 * Una sección del motor se arma con piezas —el subtítulo, la intro, el cuerpo (las tarjetas, la tabla, el hilo)— y
 * desde hoy cada pieza se arrastra y se quita como un ítem (components/landing/partes.tsx).
 *
 * Dónde vive: `data.__partes = { orden?, quitadas? }`, en el Json del bloque de la sección. Fuera del esquema del agente
 * (`preserveNonSchemaKeys` lo acarrea al regenerar: lo que quitó una persona sigue quitado aunque la IA vuelva a
 * escribir una intro) y fuera del contenido (`NO_CONTENIDO` de lib/landing/is-blank.ts: una sección vacía con piezas
 * reordenadas sigue vacía).
 */

export const CLAVE_DE_LAS_PARTES = "__partes";

export interface EstadoDeLasPartes {
  /** El orden de las piezas, por su id. Las que falten van en su lugar de siempre. */
  orden: string[];
  /** Las piezas que una persona quitó: no se pintan (ni su ayuda) hasta que alguien las vuelve a agregar. */
  quitadas: string[];
}

const comoLista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Lee `data.__partes` sin confiar en la forma (viene de la base y del chat). */
export function leerPartes(data: unknown): EstadoDeLasPartes {
  const p = (data as Record<string, unknown> | null | undefined)?.[CLAVE_DE_LAS_PARTES] as Record<string, unknown> | undefined;
  return { orden: comoLista(p?.orden), quitadas: comoLista(p?.quitadas) };
}

/**
 * El orden de las piezas: el guardado (solo las que existen), y cada pieza que no estaba va detrás de la que la precede
 * en el orden de siempre (la misma regla que `sectionSequence` para las secciones de un canvas). Sin guardado, el de
 * siempre.
 */
export function ordenDeLasPartes(deSiempre: readonly string[], guardado: readonly string[]): string[] {
  const existe = new Set(deSiempre);
  const seq = guardado.filter((id, i) => existe.has(id) && guardado.indexOf(id) === i);
  for (const id of deSiempre) {
    if (seq.includes(id)) continue;
    const i = deSiempre.indexOf(id);
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const pos = seq.indexOf(deSiempre[j]);
      if (pos !== -1) {
        at = pos + 1;
        break;
      }
    }
    seq.splice(at, 0, id);
  }
  return seq;
}

/**
 * El orden nuevo después de arrastrar las piezas VISIBLES: las visibles en su orden nuevo, y cada una que no se ve
 * (quitada o vacía) se queda pegada detrás de la misma pieza que antes.
 */
export function reordenarVisibles(completo: readonly string[], visiblesNuevas: readonly string[]): string[] {
  const visibles = new Set(visiblesNuevas);
  const out = [...visiblesNuevas];
  for (let i = 0; i < completo.length; i++) {
    const id = completo[i];
    if (visibles.has(id)) continue;
    const anterior = completo.slice(0, i).reverse().find((x) => out.includes(x));
    out.splice(anterior ? out.indexOf(anterior) + 1 : 0, 0, id);
  }
  return out;
}

/**
 * Las piezas de una data, para los `set` que escriben una forma LIMPIA (`{ intro, etapas, ...next }` en la
 * Planificación): sin esto, editar una etapa borraba lo que una persona quitó o reordenó. `{}` si no hay.
 */
export function partesDe(data: unknown): Record<string, unknown> {
  const p = (data as Record<string, unknown> | null | undefined)?.[CLAVE_DE_LAS_PARTES];
  return p === undefined ? {} : { [CLAVE_DE_LAS_PARTES]: p };
}

/** El estado con una pieza quitada (o devuelta). Idempotente. */
export function conParteQuitada(e: EstadoDeLasPartes, id: string, quitada: boolean): EstadoDeLasPartes {
  const sin = e.quitadas.filter((x) => x !== id);
  return { orden: e.orden, quitadas: quitada ? [...sin, id] : sin };
}
