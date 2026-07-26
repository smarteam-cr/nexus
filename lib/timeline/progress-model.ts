/**
 * lib/timeline/progress-model.ts — CUÁNTO AVANZÓ un cronograma, de verdad. PURO.
 *
 * ── EL PROBLEMA ──────────────────────────────────────────────────────────────
 * El avance era un conteo plano de tareas: `hechas / total`. Sin peso por semana ni por fase,
 * o sea que una fase de 1 semana con 2 tareas pesaba exactamente igual que una de 8 semanas
 * con 2 tareas. Dos proyectos con el mismo porcentaje podían estar en momentos completamente
 * distintos del calendario, y el número que veía el CSE —y el cliente— no lo distinguía.
 *
 * Peor: convivían TRES fórmulas. `lib/portfolio/summary.ts` sacaba las suspendidas del
 * denominador, `TimelineGantt.tsx` las contaba como hechas Y en el denominador, y la línea del
 * cliente coincidía con la primera solo por casualidad (el snapshot externo ya venía filtrado).
 * Con 10 tareas, 5 hechas y 2 suspendidas, la cartera decía 62% y el Gantt 70%.
 *
 * ── LA REGLA DE PESO, Y POR QUÉ ESTA ─────────────────────────────────────────
 * **Peso de una fase = `durationWeeks`.** Dentro de la fase, las tareas que cuentan pesan
 * igual entre sí. Se suman DURACIONES (esfuerzo), no el tramo de calendario que ocupa el
 * proyecto: con fases en paralelo —que `startWeek` permite— el calendario mide menos que el
 * trabajo, y lo que se quiere ponderar es el trabajo.
 *
 * Una fase SIN tareas no se descarta ni se cuenta como cero: se resuelve por su propio
 * `status`, que es lo único que alguien declaró de ella. Son 12 de los 32 cronogramas de la
 * base — descartarlas dejaría a un tercio de la cartera sin número.
 *
 * ── DOS NÚMEROS, NO UNO ──────────────────────────────────────────────────────
 * `pct` dice cuánto se hizo del PLAN. `expectedPct` dice cuánto esperaría el CALENDARIO a
 * hoy. La diferencia (`gapPct`) es la única lectura honesta de "vamos bien o vamos mal": un
 * 40% en la semana 2 y un 40% en la semana 15 no son la misma noticia.
 *
 * `expectedPct` es `null` sin fecha de arranque —17 de 32 cronogramas hoy—, y eso NO se
 * rellena con cero: sin ancla no hay calendario contra el cual comparar, y un cero se leería
 * como "el calendario no esperaba nada", que es lo contrario de "no sabemos".
 *
 * Las fechas salen de `computePhaseRanges` de weeks.ts, el mismo que usan el Gantt y los
 * atrasos. No hay un segundo algoritmo de fechas en este archivo.
 */
import { computePhaseRanges } from "./weeks";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export interface ProgressTask {
  id?: string;
  status: string;
  weekIndex: number;
}

export interface ProgressPhase {
  id?: string;
  status: string;
  durationWeeks: number;
  startWeek?: number | null;
  tasks?: ProgressTask[];
}

/** El avance de UNA fase dentro del total, para poder explicar el número. */
export interface PhaseProgress {
  id: string | null;
  /** Semanas de plan que aporta esta fase. */
  weight: number;
  /** 0..1 — qué parte de ESTA fase está hecha. */
  donePct: number;
  /** 0..1 — qué parte de su calendario ya transcurrió. null sin ancla. */
  elapsedPct: number | null;
  /** ¿Tiene tareas? Sin ellas el avance sale del `status` de la fase, que es más grueso. */
  hasDetail: boolean;
}

export interface WeightedProgress {
  /** Suma de `durationWeeks`. 0 = no hay fases. */
  weightTotal: number;
  /** Semanas de plan efectivamente hechas. */
  weightDone: number;
  /** 0..1 — avance del PLAN. null cuando no hay fases (no es lo mismo que 0%). */
  pct: number | null;
  /** 0..1 — avance que el CALENDARIO esperaría hoy. null sin fecha de arranque. */
  expectedPct: number | null;
  /** `pct - expectedPct`. Negativo = atrasado contra el calendario. null si falta alguno. */
  gapPct: number | null;
  /** Semanas de plan vencidas y sin resolver — el atraso, medido en peso y no en filas. */
  overdueWeight: number;
  /** Cuántas fases no tienen ni una tarea (su avance sale del status, más grueso). */
  phasesWithoutDetail: number;
  byPhase: PhaseProgress[];
}

/**
 * LA REGLA ÚNICA de conteo de tareas, para que las tres pantallas digan el mismo número.
 *
 * Las SUSPENDIDAS están resueltas (aparcadas a propósito) pero no hechas: salen del numerador
 * Y del denominador. Así una fase con todo hecho más una suspendida lee 100%, que es lo cierto
 * — no queda nada por hacer ahí.
 */
export function resolvedTaskCounts(tasks: Array<{ status: string }>): {
  /** Todas, incluidas las suspendidas. */
  total: number;
  suspended: number;
  done: number;
  /** DONE + SUSPENDED: las que ya no esperan a nadie. */
  resolved: number;
  /** El denominador del avance: total − suspendidas. */
  denominator: number;
} {
  let suspended = 0;
  let done = 0;
  for (const t of tasks) {
    if (t.status === "SUSPENDED") suspended++;
    else if (t.status === "DONE") done++;
  }
  return {
    total: tasks.length,
    suspended,
    done,
    resolved: done + suspended,
    denominator: tasks.length - suspended,
  };
}

/** Avance de una fase SIN tareas, a partir de lo único declarado: su propio estado. */
function donePctFromStatus(status: string): number {
  if (status === "DONE") return 1;
  // IN_PROGRESS no dice CUÁNTO, así que no se inventa un 50%: un número inventado en la
  // pantalla de avance es exactamente lo que hace que nadie le crea al resto.
  return 0;
}

export function computeWeightedProgress(input: {
  phases: ProgressPhase[];
  anchorStartDate: Date | string | null;
  now: Date;
}): WeightedProgress {
  const { phases, now } = input;
  const anchor = input.anchorStartDate ? new Date(input.anchorStartDate) : null;
  const anchorOk = anchor && Number.isFinite(anchor.getTime()) ? anchor : null;

  // Semana (fraccionaria) en la que estamos. Fraccionaria a propósito: con semanas enteras el
  // avance esperado saltaba de golpe los lunes y el gap parecía abrirse solo.
  const curWeek = anchorOk ? (now.getTime() - anchorOk.getTime()) / WEEK_MS : null;

  const ranges = computePhaseRanges(phases);

  let weightTotal = 0;
  let weightDone = 0;
  let weightExpected = 0;
  let overdueWeight = 0;
  let phasesWithoutDetail = 0;
  const byPhase: PhaseProgress[] = [];

  phases.forEach((p, i) => {
    const weight = Math.max(p.durationWeeks || 0, 0);
    const tasks = p.tasks ?? [];
    const hasDetail = tasks.length > 0;
    if (!hasDetail) phasesWithoutDetail++;

    const counts = resolvedTaskCounts(tasks);
    const donePct = hasDetail
      ? counts.denominator > 0
        ? counts.done / counts.denominator
        : /* todas suspendidas: no queda nada por hacer en esta fase */ 1
      : donePctFromStatus(p.status);

    const { start, end } = ranges[i];
    const elapsedPct =
      curWeek === null ? null : clamp01(weight > 0 ? (curWeek - start) / weight : curWeek >= end ? 1 : 0);

    weightTotal += weight;
    weightDone += weight * donePct;
    if (elapsedPct !== null) weightExpected += weight * elapsedPct;

    /* Lo vencido se mide en PESO, no en filas: 3 tareas vencidas de una fase de 1 semana pesan
       menos que 1 de una fase de 8, y el CSE necesita saber cuál de las dos le movió el plan. */
    if (elapsedPct !== null) {
      const vencido = Math.max(elapsedPct - donePct, 0);
      overdueWeight += weight * vencido;
    }

    byPhase.push({ id: p.id ?? null, weight, donePct, elapsedPct, hasDetail });
  });

  const pct = weightTotal > 0 ? weightDone / weightTotal : null;
  const expectedPct = weightTotal > 0 && curWeek !== null ? weightExpected / weightTotal : null;

  return {
    weightTotal,
    weightDone,
    pct,
    expectedPct,
    gapPct: pct !== null && expectedPct !== null ? pct - expectedPct : null,
    overdueWeight,
    phasesWithoutDetail,
    byPhase,
  };
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
