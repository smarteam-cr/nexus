/**
 * lib/timeline/foto-del-plan.ts — LA FOTO DEL PLAN NO SE TRAGA LO QUE SE AGREGÓ DESPUÉS.
 *
 * ── EL DEFECTO QUE ARREGLA ───────────────────────────────────────────────────
 * Al publicar un cronograma se congela una FOTO: lo que se le prometió al cliente. Después, cada
 * vez que se regeneraba una fase, `patchBaselinePhaseTasks` reemplazaba las tareas de esa fase en
 * la foto por **las vivas**, con ids nuevos incluidos. O sea que toda tarea agregada después de
 * la promesa entraba a la promesa retroactivamente.
 *
 * La consecuencia se mide en `lib/portfolio/summary.ts`: `addedTasks` cuenta las tareas vivas
 * cuyo id NO está en la foto. Si la foto las absorbe, **ese número es cero para siempre** — y el
 * alcance excedido, que es lo que esta parte del plan viene a poder medir, no se puede ver ni
 * habiendo crecido al doble.
 *
 * ── POR QUÉ ESTABA ASÍ, Y POR QUÉ IGUAL SE CAMBIA ────────────────────────────
 * El código original lo explica: evitar un falso scope-creep. Al regenerar una fase, las tareas
 * cambian de id aunque el trabajo sea el mismo, y sin el parche cada regeneración se vería como
 * «agregaron 12 tareas». El parche resolvió eso absorbiendo TODO, que arregla el falso positivo
 * matando también los verdaderos. La distinción correcta es por ID: una tarea que YA estaba en la
 * foto sigue siendo la misma promesa aunque se le muevan las fechas; una que nunca estuvo es
 * alcance nuevo, y la foto no la conoce.
 *
 * ── LO QUE SE BORRÓ EN VIVO SE QUEDA EN LA FOTO ──────────────────────────────
 * Una tarea prometida que después se elimina NO desaparece del snapshot: la promesa se hizo. Si
 * se fuera, «prometimos X y no lo hicimos» dejaría de poder decirse — y borrar la evidencia sería
 * la forma más silenciosa de que el alcance cierre siempre.
 */

/** Lo mínimo que hace falta de una tarea de la foto para re-sincronizarla. */
export interface EntradaDeFoto {
  id: string;
  weekIndex: number;
  order: number;
  plannedStart: string | null;
  plannedEnd: string | null;
}

/** Lo mínimo de una tarea VIVA. */
export interface TareaViva {
  id: string;
  weekIndex: number;
  order: number;
}

/**
 * Decide qué tareas vivas pueden actualizar la foto: SOLO las que ya estaban.
 *
 * Devuelve los ids en el orden de las vivas, para que quien recalcule fechas trabaje sobre las
 * filas frescas. Las que no están en la foto quedan afuera — son alcance agregado.
 */
export function vivasQueYaEstabanEnLaFoto<T extends TareaViva>(
  enLaFoto: ReadonlyArray<{ id: string }>,
  vivas: readonly T[],
): T[] {
  const conocidas = new Set(enLaFoto.map((t) => t.id));
  return vivas.filter((t) => conocidas.has(t.id));
}

/**
 * Re-sincroniza la foto de una fase con las tareas vivas.
 *
 * · Una entrada de la foto que sigue viva → se le actualizan semana, orden y fechas planeadas.
 * · Una entrada de la foto que ya no está viva → **se conserva tal cual**.
 * · Una tarea viva que no estaba en la foto → **NO entra**.
 *
 * El ORDEN de la foto se conserva: es parte de lo que se prometió, y reordenarlo por lo vivo
 * haría que un diff contra una publicación anterior se vea distinto sin que nadie haya movido
 * nada.
 *
 * @param recalcular cómo obtener las fechas planeadas de una tarea viva. Se inyecta para que este
 *   módulo no dependa del calendario ni del ancla — la aritmética ya tiene dueño en `weeks.ts`.
 */
export function resincronizarFotoDeFase<T extends TareaViva, E extends EntradaDeFoto>(
  enLaFoto: readonly E[],
  vivas: readonly T[],
  recalcular: (viva: T) => { plannedStart: string | null; plannedEnd: string | null },
): E[] {
  const vivasPorId = new Map(vivas.map((t) => [t.id, t]));
  return enLaFoto.map((entrada) => {
    const viva = vivasPorId.get(entrada.id);
    if (!viva) return entrada; // se borró en vivo: la promesa queda escrita
    const fechas = recalcular(viva);
    return {
      ...entrada,
      weekIndex: viva.weekIndex,
      order: viva.order,
      plannedStart: fechas.plannedStart,
      plannedEnd: fechas.plannedEnd,
    };
  });
}
