/**
 * lib/timeline/semanas-de-la-lista.ts — cómo se reparten las semanas de una fase en la lista desplegada del Gantt.
 *
 * Cada semana con tareas va sola, como siempre. Las semanas SIN tareas que van seguidas se juntan en una sola línea
 * («Semanas 6 a 12 · sin tareas»): un loop de 12 semanas con dos tareas mostraba diez renglones de «Sin tareas esta
 * semana» (Elías, 20 nov). Vale para todas las fases de todos los cronogramas; la barra de arriba no cambia.
 *
 * «Con tareas» es lo que la lista pone en esa semana: las tareas que ARRANCAN ahí. Una tarea de varias semanas se lista
 * una sola vez, en su primera semana, así que las semanas que solo recorre cuentan como sin tareas en la lista (la
 * barra sí las pinta). Puro y client-safe.
 */

export type TramoDeLaLista =
  | { tipo: "con-tareas"; semana: number }
  | { tipo: "sin-tareas"; desde: number; hasta: number };

/** Los tramos de una fase de `duracion` semanas (0-indexadas, relativas a la fase), en orden. */
export function tramosDeLaLista(duracion: number, conTareas: (semana: number) => boolean): TramoDeLaLista[] {
  const tramos: TramoDeLaLista[] = [];
  for (let semana = 0; semana < duracion; semana++) {
    if (conTareas(semana)) {
      tramos.push({ tipo: "con-tareas", semana });
      continue;
    }
    const ultimo = tramos[tramos.length - 1];
    if (ultimo?.tipo === "sin-tareas" && ultimo.hasta === semana - 1) ultimo.hasta = semana;
    else tramos.push({ tipo: "sin-tareas", desde: semana, hasta: semana });
  }
  return tramos;
}

/**
 * Las semanas que la lista muestra solas: las que tienen tareas. Mientras se ARRASTRA una tarea, también las que tenían
 * tareas al empezar el arrastre: si la semana de donde sale se juntara con sus vecinas, todo lo de abajo subiría bajo el
 * puntero y la tarea seguiría cayendo de semana en semana (revisión del 20 nov). Al soltar, la lista se vuelve a armar.
 */
export function semanasConTareas(
  tareas: readonly { weekIndex: number }[],
  alEmpezarElArrastre?: readonly { weekIndex: number }[] | null,
): Set<number> {
  return new Set([...tareas, ...(alEmpezarElArrastre ?? [])].map((t) => t.weekIndex));
}

/** «Semana 6 · sin tareas» o «Semanas 6 a 12 · sin tareas» (en pantalla las semanas arrancan en 1). */
export function rotuloDeSemanasSinTareas(desde: number, hasta: number): string {
  return hasta > desde ? `Semanas ${desde + 1} a ${hasta + 1} · sin tareas` : `Semana ${desde + 1} · sin tareas`;
}
