/**
 * lib/timeline/client-blockers.ts
 *
 * Deriva la lista de "pendientes del cliente atrasados": tareas del cronograma cuyo
 * responsable es el CLIENTE (insumos, accesos, documentación, listados) que ya vencieron
 * y no están hechas. Es lo que el CSE quiere señalarle al cliente en cada sesión ("esto
 * es lo que necesitamos de ustedes / lo que frena la implementación").
 *
 * Puro y client-safe (solo depende de `weeks.ts`). Genérico sobre el tipo de tarea para
 * servir a las DOS vistas sin duplicar el cálculo: la interna (GanttPhase/GanttTask, tema
 * oscuro) y la externa (ExternalTimelinePhase/ExternalTimelineTask, tema light). Cada vista
 * renderiza con su propio tema; el criterio de "atrasada" es idéntico (mismo `isOverdue` que
 * el tag rojo del Gantt) para que ambas coincidan.
 */
import { addWeeks, absoluteWeek, computePhaseRanges, currentWeekIndex, isOverdue } from "./weeks";

export interface BlockerTaskLike {
  title: string;
  weekIndex: number;
  status?: string;
  party?: string | null;
}

export interface BlockerPhaseLike<T extends BlockerTaskLike> {
  /** Orden explícito; si falta, se usa la posición en el array (las fases vienen ya ordenadas). */
  order?: number;
  startWeek?: number | null;
  durationWeeks: number;
  name: string;
  /** Puede faltar en snapshots externos sin detalle → se trata como sin tareas. */
  tasks?: T[];
}

export interface ClientBlocker<T, P> {
  /** La tarea original (genérica) — el caller accede a lo que necesite (p.ej. su `key` para el drawer). */
  task: T;
  /** La fase original (genérica) — p.ej. su `key` para abrir el drawer, o `name` para mostrar. */
  phase: P;
  phaseName: string;
  absWeek: number;
  /** Semanas completas de atraso (≥ 1). */
  weeksLate: number;
  /** Fin de la semana de la tarea (ISO) = fecha de vencimiento; null si no hay anchor. */
  dueDateIso: string | null;
}

/** Tipo de tarea de una fase (inferido estructuralmente) — para que el caller recupere la tarea concreta. */
type TaskOf<P> = P extends BlockerPhaseLike<infer T> ? T : never;

/**
 * Tareas `party = CLIENTE` vencidas y no resueltas, ordenadas de más a menos atrasada.
 * `now` DEBE venir del cliente (hora de pared local, tras montar). Sin `now` (SSR/no
 * hidratado) o sin anchor → `[]`: no hay "hoy" contra el cual medir el atraso.
 *
 * Un solo type param (`P`) para que TS infiera la fase directamente de `phases`; el tipo de
 * tarea sale de `P` con `infer` (dos params entrelazados no se infieren desde `phases: P[]`).
 */
export function collectClientBlockers<P extends BlockerPhaseLike<BlockerTaskLike>>(
  phases: P[],
  anchor: string | null,
  now: Date | null,
): ClientBlocker<TaskOf<P>, P>[] {
  if (!now || !anchor || phases.length === 0) return [];
  const curWeek = currentWeekIndex(anchor, now);
  if (curWeek === null) return [];

  // Ordenar por `order` explícito; sin él, respetar la posición del array (las fases ya vienen
  // ordenadas en ambos callers). computePhaseRanges asume ese mismo orden.
  const sorted = phases
    .map((phase, i) => ({ phase, ord: phase.order ?? i }))
    .sort((a, b) => a.ord - b.ord)
    .map((x) => x.phase);
  const ranges = computePhaseRanges(sorted);

  const out: ClientBlocker<TaskOf<P>, P>[] = [];
  sorted.forEach((phase, i) => {
    const range = ranges[i];
    // `phase.tasks` se tipa al constraint (BlockerTaskLike[]); son en realidad TaskOf<P>[].
    for (const task of (phase.tasks ?? []) as TaskOf<P>[]) {
      if (task.party !== "CLIENTE") continue;
      const absWeek = absoluteWeek(range.start, task.weekIndex);
      if (!isOverdue(absWeek, curWeek, task.status ?? "")) continue;
      out.push({
        task,
        phase,
        phaseName: phase.name,
        absWeek,
        weeksLate: curWeek - absWeek,
        // +1 = fin de la semana de la tarea (misma convención que lib/portfolio/summary.ts).
        dueDateIso: addWeeks(anchor, absWeek + 1).toISOString(),
      });
    }
  });

  // Más atrasada primero; a igual atraso, respeta el orden de fase/tarea (estable).
  return out.sort((a, b) => b.weeksLate - a.weeksLate);
}
