/**
 * lib/timeline/regen-columnas.ts
 *
 * Nació para el reparto inicial de las DOS COLUMNAS del modal de curación (regen de una fase o de
 * todo el cronograma). Ese modal se borró en E2b (2026-09-25): «Regenerar» deja UNA propuesta que se
 * revisa en la barra de arriba del Gantt. Se fueron con él `repartoInicial` y `phaseHasChanges`; su
 * regla («el agente no propuso nada» NO es «borra todo») vive en R1 de lib/timeline/tareas-del-detalle.ts.
 *
 * Quedan dos piezas puras:
 *  · `isKept`, la regla ÚNICA de «esto no se toca», que usan el borrador, el detalle, las operaciones
 *    del chat y el rescate del avance;
 *  · `fugaTrasEditar`, que E3 necesita cuando el chat edite tareas propuestas.
 * El nombre del archivo se queda para no mover cuatro importadores por un rótulo.
 */

export interface TareaActualParaReparto {
  status: string;
  source?: string | null;
}

/**
 * Lo que NO se reemplaza: lo que tiene progreso humano encima —iniciada, hecha o suspendida
 * (≠ PENDING)— o lo cargado a mano (HUMAN). El resto (PENDING + AGENT/MODIFIED) es material que el
 * agente puede reemplazar.
 */
export const isKept = (t: TareaActualParaReparto): boolean =>
  t.status !== "PENDING" || t.source === "HUMAN";

/**
 * La marca de FUGA de una tarea propuesta después de que el CSE la edita en la curación
 * (2026-09-23). La marca dice QUÉ campo cruza la frontera del material interno —el título o la
 * nota— y se va solo cuando el CSE toca ESE campo: editar el título limpia una fuga del título;
 * «Quitar nota», una de la nota. Tocar otro campo no la limpia: cambiar el dueño no arregla una
 * fecha escrita en la nota, y el chip tiene que seguir ahí.
 *
 * Si el título Y la nota cruzaban (`motivoDeLaNota`), corregir el título no la borra: la marca
 * pasa a la nota, que el cliente también lee (revisión del paso D3, 2026-09-24). Tocar la nota
 * primero la saca de la marca del título.
 *
 * Tipado estructural, como el resto del archivo: la `FugaDeTarea` de la frontera lo satisface.
 */
export function fugaTrasEditar<F extends { campo: "titulo" | "nota"; motivo: string; motivoDeLaNota?: string }>(
  fuga: F | null,
  cambio: object,
): F | null {
  if (!fuga) return null;
  const tocaTitulo = "title" in cambio;
  const tocaNota = "notes" in cambio;
  if (fuga.campo === "nota") return tocaNota ? null : fuga;
  // La marca es del título.
  const nota = tocaNota ? undefined : fuga.motivoDeLaNota;
  if (tocaTitulo) return nota ? { ...fuga, campo: "nota", motivo: nota, motivoDeLaNota: undefined } : null;
  if (tocaNota && fuga.motivoDeLaNota) return { ...fuga, motivoDeLaNota: undefined };
  return fuga;
}
