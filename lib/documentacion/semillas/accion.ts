/**
 * lib/documentacion/semillas/accion.ts — qué hace la siembra con una página. PURO.
 *
 * Una página sembrada tiene DOS dueños, y esta función es la que no los mezcla:
 *   · la ESTRUCTURA —en qué página vive y en qué orden— la manda la semilla;
 *   · el CONTENIDO, en cuanto una persona lo edita, pasa a ser de esa persona.
 *
 * Por eso una página editada que la semilla ubica en otro lugar del árbol no se «saltea» entera:
 * se MUEVE, sin tocar su contenido ni su versión. Pasó con la Guía de CSE, que Elías editó y que
 * después tuvo que quedar adentro de Customer Success. Antes de esta función se habría quedado
 * en la raíz para siempre, y la única salida era `--forzar`, que le pisaba lo escrito.
 *
 * ⚠ En seco, la madre de una página puede no existir todavía y no tiene id: se avisa con
 * `madrePendiente`, porque comparar un `null` que significa «todavía no sé» contra un `null` que
 * significa «está en la raíz» diría que la página ya está en su lugar.
 */

export type AccionDeSiembra = "crear" | "actualizar" | "saltar" | "mover";

/** Lo que la base sabe hoy de la página. `null` = la página no existe. */
export interface PaginaExistente {
  version: number;
  /** La versión que dejó la última siembra. `null` = la creó una persona. */
  semillaVersion: number | null;
  parentId: string | null;
  orden: number;
}

/** Dónde la quiere la semilla. */
export interface DestinoDeSiembra {
  parentId: string | null;
  orden: number;
  /** La madre se va a crear en esta misma corrida (en seco todavía no tiene id). */
  madrePendiente?: boolean;
}

export interface DecisionDeSiembra {
  accion: AccionDeSiembra;
  /** Una persona la editó después de la última siembra. */
  editada: boolean;
}

export function decidirAccion(
  existente: PaginaExistente | null,
  destino: DestinoDeSiembra,
  forzar: boolean,
): DecisionDeSiembra {
  if (!existente) return { accion: "crear", editada: false };

  const editada = existente.semillaVersion === null || existente.version !== existente.semillaVersion;
  if (!editada || forzar) return { accion: "actualizar", editada };

  const fueraDeLugar =
    destino.madrePendiente === true ||
    existente.parentId !== destino.parentId ||
    existente.orden !== destino.orden;

  return { accion: fueraDeLugar ? "mover" : "saltar", editada };
}
