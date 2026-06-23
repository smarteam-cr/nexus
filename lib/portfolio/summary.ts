/**
 * lib/portfolio/summary.ts
 *
 * D.3 panel de cartera — MOTOR de derivación por proyecto. Funciones PURAS (sin Prisma,
 * sin IA, testeables): reciben el estado de UN proyecto (timeline vivo + baseline activo +
 * fechas reales + status) y devuelven su resumen: avance, riesgos, control de alcance y
 * salud derivada. El loader (load.ts) trae los datos en batch y mapea cada proyecto por acá.
 *
 * Reusa la convención semanas→fechas de lib/timeline/weeks.ts. `import type` para los tipos
 * de Prisma/baseline → este módulo NO arrastra Prisma en runtime (queda puro).
 */
import type { ProjectHealth } from "@prisma/client";
import type { BaselineSnapshot } from "@/lib/timeline/baseline";
import { computePhaseRanges, addWeeks } from "@/lib/timeline/weeks";

export const STALL_DAYS = 14; // "sin avance" por defecto (configurable después)
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Input (lean, desacoplado de los tipos exactos de Prisma) ──────────────────
export interface SummaryTask {
  id: string;
  status: string;
  weekIndex: number;
  actualStart: Date | null;
  actualEnd: Date | null;
  needsValidation: boolean;
}
export interface SummaryPhase {
  id: string;
  name: string;
  status: string;
  order: number;
  durationWeeks: number;
  actualStart: Date | null;
  actualEnd: Date | null;
  tasks: SummaryTask[];
}
export interface SummaryInput {
  status: string; // Project.status: active | paused | completed
  anchorStartDate: Date | null;
  phases: SummaryPhase[];
  baseline: { snapshot: BaselineSnapshot; firmnessLabel: string } | null;
  lastProgressAt: Date | null; // último TimelineChange kind=PROGRESS
  healthOverride: ProjectHealth | null;
  now?: Date;
}

// ── Output ────────────────────────────────────────────────────────────────────
export interface ProjectSummary {
  progress: { phasesDone: number; phasesTotal: number; tasksDone: number; tasksTotal: number; pct: number };
  overduePhases: number;
  overdueTasks: number;
  worstDaysLate: number;
  // Fase peor-atrasada (nombre + días) para el panel; null si no hay fase atrasada.
  worstOverduePhase: { name: string; daysLate: number } | null;
  stalled: boolean;
  daysSinceActivity: number | null;
  weakBaseline: boolean;
  hasBaseline: boolean;
  scope: {
    measurable: boolean; // false si no hay baseline ("sin línea base")
    addedPhases: number;
    addedTasks: number;
    weeksDelta: number;
    attenuated: boolean; // baseline WEAK → probablemente detalle, no extra real
    exceeded: boolean;
  };
  health: {
    derived: ProjectHealth;
    override: ProjectHealth | null;
    resolved: ProjectHealth; // override ?? derived
    source: "override" | "derived";
  };
}

const totalWeeks = (phases: Array<{ durationWeeks: number }>): number =>
  phases.reduce((n, p) => n + (p.durationWeeks || 0), 0);

// plannedEnd por id de fase/tarea: del baseline congelado, o (sin baseline) del plan vivo.
function plannedEnds(input: SummaryInput): { phase: Map<string, Date>; task: Map<string, Date> } {
  const phase = new Map<string, Date>();
  const task = new Map<string, Date>();

  if (input.baseline) {
    for (const p of input.baseline.snapshot.phases) {
      if (p.plannedEnd) phase.set(p.id, new Date(p.plannedEnd));
      for (const t of p.tasks) if (t.plannedEnd) task.set(t.id, new Date(t.plannedEnd));
    }
    return { phase, task };
  }

  // Sin baseline: derivar del anchor + duraciones vivas (mismo cálculo que weeks.ts).
  if (!input.anchorStartDate) return { phase, task };
  const anchorIso = input.anchorStartDate.toISOString();
  const ordered = [...input.phases].sort((a, b) => a.order - b.order);
  const ranges = computePhaseRanges(ordered);
  ordered.forEach((p, i) => {
    const r = ranges[i];
    phase.set(p.id, addWeeks(anchorIso, r.end));
    for (const t of p.tasks) task.set(t.id, addWeeks(anchorIso, r.start + t.weekIndex + 1));
  });
  return { phase, task };
}

export function computeProjectSummary(input: SummaryInput): ProjectSummary {
  const now = input.now ?? new Date();
  const phases = input.phases;
  const allTasks = phases.flatMap((p) => p.tasks);

  // ── Avance ──
  const phasesTotal = phases.length;
  const phasesDone = phases.filter((p) => p.status === "DONE").length;
  // E — las tareas SUSPENDED están resueltas (aparcadas): fuera del denominador del avance,
  // así una fase toda Hecha + 1 Suspendida lee 100%, no <100%.
  const tasksTotal = allTasks.filter((t) => t.status !== "SUSPENDED").length;
  const tasksDone = allTasks.filter((t) => t.status === "DONE").length;
  const pct = tasksTotal > 0 ? tasksDone / tasksTotal : phasesTotal > 0 ? phasesDone / phasesTotal : 0;

  // ── Atrasos (plannedEnd pasó y no DONE) ──
  const ends = plannedEnds(input);
  let overduePhases = 0;
  let overdueTasks = 0;
  let worstMs = 0;
  // Fase peor-atrasada (nombre) para el panel: la de mayor atraso entre las vencidas.
  let worstPhaseMs = 0;
  let worstPhaseName: string | null = null;
  for (const p of phases) {
    const pe = ends.phase.get(p.id);
    if (pe && pe.getTime() < now.getTime() && p.status !== "DONE") {
      overduePhases++;
      const late = now.getTime() - pe.getTime();
      worstMs = Math.max(worstMs, late);
      if (late > worstPhaseMs) { worstPhaseMs = late; worstPhaseName = p.name; }
    }
    for (const t of p.tasks) {
      const te = ends.task.get(t.id);
      // E — no es vencida si está resuelta (DONE/SUSPENDED) ni si su fase ya está DONE
      // (red barata para data vieja: fase cerrada con tareas PENDING sueltas).
      if (te && te.getTime() < now.getTime() && t.status !== "DONE" && t.status !== "SUSPENDED" && p.status !== "DONE") {
        overdueTasks++;
        worstMs = Math.max(worstMs, now.getTime() - te.getTime());
      }
    }
  }
  const worstDaysLate = Math.floor(worstMs / DAY_MS);
  const worstOverduePhase = worstPhaseName
    ? { name: worstPhaseName, daysLate: Math.floor(worstPhaseMs / DAY_MS) }
    : null;

  // ── Sin avance (stalled) ──
  const started = !!input.anchorStartDate && input.anchorStartDate.getTime() <= now.getTime();
  const isCompleted = input.status === "completed";
  const activityDates: number[] = [];
  for (const p of phases) {
    if (p.actualStart) activityDates.push(p.actualStart.getTime());
    if (p.actualEnd) activityDates.push(p.actualEnd.getTime());
    for (const t of p.tasks) {
      if (t.actualStart) activityDates.push(t.actualStart.getTime());
      if (t.actualEnd) activityDates.push(t.actualEnd.getTime());
    }
  }
  if (input.lastProgressAt) activityDates.push(input.lastProgressAt.getTime());
  const lastActivity = activityDates.length ? Math.max(...activityDates) : null;
  // Referencia: última actividad real; si nunca hubo, el arranque (anchor).
  const ref = lastActivity ?? (input.anchorStartDate ? input.anchorStartDate.getTime() : null);
  const daysSinceActivity = ref !== null ? Math.floor((now.getTime() - ref) / DAY_MS) : null;
  const stalled =
    started && !isCompleted && daysSinceActivity !== null && daysSinceActivity > STALL_DAYS;

  // ── Firmeza ──
  const hasBaseline = !!input.baseline;
  const weakBaseline = hasBaseline && input.baseline!.firmnessLabel === "WEAK";

  // ── Control de alcance (diff baseline vs vivo, por id; sin IA) ──
  let scope: ProjectSummary["scope"];
  if (!input.baseline) {
    scope = { measurable: false, addedPhases: 0, addedTasks: 0, weeksDelta: 0, attenuated: false, exceeded: false };
  } else {
    const basePhaseIds = new Set(input.baseline.snapshot.phases.map((p) => p.id));
    const baseTaskIds = new Set(input.baseline.snapshot.phases.flatMap((p) => p.tasks.map((t) => t.id)));
    const addedPhases = phases.filter((p) => !basePhaseIds.has(p.id)).length;
    const addedTasks = allTasks.filter((t) => !baseTaskIds.has(t.id)).length;
    const weeksDelta = totalWeeks(phases) - totalWeeks(input.baseline.snapshot.phases);
    const exceeded = addedPhases > 0 || addedTasks > 0 || weeksDelta > 0;
    scope = { measurable: true, addedPhases, addedTasks, weeksDelta, attenuated: weakBaseline, exceeded };
  }

  // ── Salud derivada ──
  let derived: ProjectHealth;
  if (input.status === "paused") {
    derived = "PAUSADO";
  } else if (isCompleted) {
    derived = "SALUDABLE"; // terminado → no se marca como riesgo
  } else if (overduePhases > 0 || stalled) {
    derived = "EN_RIESGO";
  } else if (overdueTasks > 0 || weakBaseline || (scope.exceeded && !scope.attenuated)) {
    derived = "EN_FRICCION";
  } else {
    derived = "SALUDABLE";
  }

  const override = input.healthOverride;
  const resolved = override ?? derived;

  return {
    progress: { phasesDone, phasesTotal, tasksDone, tasksTotal, pct },
    overduePhases,
    overdueTasks,
    worstDaysLate,
    worstOverduePhase,
    stalled,
    daysSinceActivity,
    weakBaseline,
    hasBaseline,
    scope,
    health: { derived, override, resolved, source: override ? "override" : "derived" },
  };
}
