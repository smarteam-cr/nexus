/**
 * lib/timeline/client-status.ts
 *
 * Estado del proyecto en LENGUAJE CLIENTE — función pura, client-safe (sin Prisma).
 *
 * Por qué existe: la vista externa del cronograma solo hablaba cuando algo estaba mal (bloque rojo de
 * "Pendiente de tu parte" y desvíos). Si el proyecto iba perfecto, el cliente no leía una sola palabra
 * y la única señal de que todo iba bien era la AUSENCIA de bloques rojos. Esta línea existe SIEMPRE:
 * dice dónde vamos, cuánto se completó y si estamos al día. Convierte la vista de "lista de problemas"
 * en "estado del proyecto".
 *
 * También corrige un defecto: antes se anunciaba "cronograma finalizado" solo porque había pasado la
 * última semana del calendario, aunque quedaran tareas sin hacer. Acá "completado" exige que estén
 * TODAS hechas; si la ventana venció con pendientes, se dice la verdad ("en cierre · quedan N").
 */

export interface ClientStatusInput {
  /** Índice 0-based de la semana actual dentro del cronograma. null = sin fecha de arranque. */
  curWeek: number | null;
  /** Semanas totales del cronograma. */
  totalWeeks: number;
  /** Tareas visibles al cliente que están hechas. */
  tasksDone: number;
  /** Tareas visibles al cliente en total. */
  tasksTotal: number;
  /** Semanas de desvío ya comunicadas (suma de los desvíos visibles). 0 = al día. */
  delayWeeks: number;
}

/** Pluraliza "semana(s)". */
function semanas(n: number): string {
  return `${n} ${n === 1 ? "semana" : "semanas"}`;
}

/** Pluraliza "tarea(s)". */
function tareas(n: number): string {
  return `${n} ${n === 1 ? "tarea" : "tareas"}`;
}

/**
 * Línea de estado para el cliente. null cuando no hay nada honesto que decir todavía
 * (sin cronograma, o el proyecto aún no arrancó — de eso ya avisa la cabecera).
 *
 * Ejemplos:
 *  - "Semana 6 de 14 · 12 de 30 tareas completadas · al día"
 *  - "Semana 6 de 14 · 12 de 30 tareas completadas · 2 semanas más de lo previsto"
 *  - "Proyecto completado · 30 de 30 tareas"
 *  - "En cierre · quedan 5 tareas"
 */
export function clientStatusLine(i: ClientStatusInput): string | null {
  if (i.totalWeeks <= 0) return null;
  if (i.curWeek === null || i.curWeek < 0) return null; // aún no arrancó

  const allDone = i.tasksTotal > 0 && i.tasksDone >= i.tasksTotal;

  // Ventana de calendario terminada.
  if (i.curWeek >= i.totalWeeks) {
    if (allDone) return `Proyecto completado · ${i.tasksDone} de ${i.tasksTotal} tareas`;
    const faltan = Math.max(0, i.tasksTotal - i.tasksDone);
    // NUNCA "finalizado" con pendientes: el cliente lo verifica y perdemos credibilidad.
    return faltan > 0 ? `En cierre · quedan ${tareas(faltan)}` : "En cierre";
  }

  // En curso.
  const partes = [`Semana ${i.curWeek + 1} de ${i.totalWeeks}`];
  if (i.tasksTotal > 0) partes.push(`${i.tasksDone} de ${i.tasksTotal} tareas completadas`);
  partes.push(i.delayWeeks > 0 ? `${semanas(i.delayWeeks)} más de lo previsto` : "al día");
  return partes.join(" · ");
}
