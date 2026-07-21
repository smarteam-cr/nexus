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
import type { ProjectHealth, ProjectLifecycleStage } from "@prisma/client";
import type { BaselineSnapshot } from "@/lib/timeline/baseline";
// Import DIRECTO del motor puro (no de lib/lifecycle/index): el index re-exporta el
// loader con Prisma y este módulo debe quedar puro (unit-testeable) — ver nota en el index.
import { stageAtOrAfter, STAGE_LABEL_ES } from "@/lib/lifecycle/stage-engine";
import { computePhaseRanges, addWeeks, isOverdueByDate } from "@/lib/timeline/weeks";

export const STALL_DAYS = 14; // "sin avance" por defecto (configurable después)
/** Días de gracia de las alarmas tempranas: kickoff sin publicar / cronograma sin consensuar. */
export const KICKOFF_PUBLISH_GRACE_DAYS = 7;
export const CRONOGRAMA_CONSENSUS_GRACE_DAYS = 14;
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
  /** Inicio explícito (offset 0-based). null/ausente = contigua tras la anterior. Lo honra computePhaseRanges (paralelismo). */
  startWeek?: number | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  tasks: SummaryTask[];
}
/**
 * Conciencia de ETAPA del ciclo de vida (lib/lifecycle). OPCIONAL: ausente = el
 * comportamiento histórico (todas las alarmas de cronograma aplican) — los callers
 * no migrados y los tests viejos no se rompen.
 */
export interface SummaryLifecycleInput {
  /** El handoff CORRIÓ y clasificó el proyecto. Si es false → sin juicios de ciclo de
   *  vida: nada de etapas, alarmas ni riesgo (el portal muestra un aviso). La barra de
   *  avance se sigue mostrando. */
  defined: boolean;
  /** Etapa EFECTIVA (override del CSE ?? inferida). */
  stage: ProjectLifecycleStage;
  source: "override" | "inferred";
  kickoffPublishedAt: Date | null;
  /** Gate CRONOGRAMA_CONSENSUADO (null = el cliente aún no lo aprobó). */
  cronogramaConsensuadoAt: Date | null;
  /** Última señal de salida cumplida (gate más reciente o kickoff) — referencia del "hace Nd" de las alarmas tempranas. */
  lastGateAt: Date | null;
  /** hubspotCreatedAt ?? createdAt — edad del proyecto. */
  projectCreatedAt: Date | null;
}

export interface SummaryInput {
  status: string; // Project.status: active | paused | completed
  anchorStartDate: Date | null;
  phases: SummaryPhase[];
  baseline: { snapshot: BaselineSnapshot; firmnessLabel: string } | null;
  lastProgressAt: Date | null; // último TimelineChange kind=PROGRESS
  healthOverride: ProjectHealth | null;
  lifecycle?: SummaryLifecycleInput | null;
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
  // ── Ciclo de vida ──
  /** ¿Las alarmas de cronograma vencido APLICAN? false solo cuando la etapa es
   *  anterior a CONFIGURACION_TECNICA (el cronograma es tentativo, no consensuado).
   *  Sin input lifecycle = true (comportamiento histórico). */
  scheduleAlarmsActive: boolean;
  stage: { effective: ProjectLifecycleStage; source: "override" | "inferred"; label: string } | null;
  /** Alarmas PROPIAS de etapas tempranas (reemplazan a las de cronograma cuando no aplican). */
  stageAlarms: Array<{
    key: "kickoff_sin_publicar" | "cronograma_sin_consensuar" | "sin_baseline";
    label: string;
    days: number;
  }>;
  /** Señales que ANTES derivaban EN_RIESGO. Hoy el sistema no lo decide: el watchdog
   *  las usa para PROPONER EN_RIESGO y el CSE confirma (healthStatusOverride). */
  riskCandidate: boolean;
}

const totalWeeks = (phases: Array<{ durationWeeks: number }>): number =>
  phases.reduce((n, p) => n + (p.durationWeeks || 0), 0);

// plannedEnd por id de fase/tarea: del baseline congelado, o (sin baseline) del plan vivo.
function plannedEnds(input: SummaryInput): { phase: Map<string, Date>; task: Map<string, Date> } {
  const phase = new Map<string, Date>();
  const task = new Map<string, Date>();

  if (input.baseline) {
    // Guard: un snapshot legacy/malformado (phases o tasks no-array) NO debe tirar TypeError → 500.
    const snapPhases = input.baseline.snapshot?.phases;
    if (Array.isArray(snapPhases)) {
      for (const p of snapPhases) {
        if (p.plannedEnd) phase.set(p.id, new Date(p.plannedEnd));
        if (Array.isArray(p.tasks)) for (const t of p.tasks) if (t.plannedEnd) task.set(t.id, new Date(t.plannedEnd));
      }
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
      // Predicado ÚNICO de atraso por-tarea (weeks.ts) — mismo que el Gantt/externo, para que
      // los números no se contradigan. Excluye DONE/SUSPENDED (resueltas). El guard extra
      // `p.status !== "DONE"` es red barata para data vieja (fase cerrada con tareas PENDING sueltas).
      if (te && isOverdueByDate(te, now, t.status) && p.status !== "DONE") {
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
    // Guard: snapshot legacy/malformado no debe tirar (phases/tasks pueden no ser array).
    const basePhases = Array.isArray(input.baseline.snapshot?.phases) ? input.baseline.snapshot.phases : [];
    const basePhaseIds = new Set(basePhases.map((p) => p.id));
    const baseTaskIds = new Set(basePhases.flatMap((p) => (Array.isArray(p.tasks) ? p.tasks.map((t) => t.id) : [])));
    const addedPhases = phases.filter((p) => !basePhaseIds.has(p.id)).length;
    const addedTasks = allTasks.filter((t) => !baseTaskIds.has(t.id)).length;
    const weeksDelta = totalWeeks(phases) - totalWeeks(basePhases);
    const exceeded = addedPhases > 0 || addedTasks > 0 || weeksDelta > 0;
    scope = { measurable: true, addedPhases, addedTasks, weeksDelta, attenuated: weakBaseline, exceeded };
  }

  // ── Ciclo de vida: ¿las alarmas de cronograma aplican en esta etapa? ──
  // Sin handoff generado (lc.defined === false) NO hay juicios de ciclo de vida: ni etapa,
  // ni alarmas, ni riesgo (el portal muestra un aviso). La barra de avance se sigue mostrando.
  // Caller legacy sin lifecycle (lc === null) = comportamiento histórico (todo activo).
  const lc = input.lifecycle ?? null;
  const lcActive = !!lc && lc.defined;
  const scheduleAlarmsActive = !lc ? true : lcActive && stageAtOrAfter(lc.stage, "CONFIGURACION_TECNICA");
  const stage = lcActive
    ? { effective: lc!.stage, source: lc!.source, label: STAGE_LABEL_ES[lc!.stage] }
    : null;

  // Alarmas PROPIAS de etapas tempranas (con gracia — lo que hace "con sentido" a la alarma).
  const stageAlarms: ProjectSummary["stageAlarms"] = [];
  if (lcActive && lc && !isCompleted && input.status !== "paused") {
    const daysSince = (d: Date | null) =>
      d ? Math.floor((now.getTime() - d.getTime()) / DAY_MS) : null;
    if (lc.stage === "HAND_OFF" && !lc.kickoffPublishedAt) {
      const age = daysSince(lc.projectCreatedAt);
      if (age !== null && age >= KICKOFF_PUBLISH_GRACE_DAYS) {
        stageAlarms.push({
          key: "kickoff_sin_publicar",
          label: `Kickoff sin publicar hace ${age}d`,
          days: age,
        });
      }
    }
    if (lc.stage === "PLANIFICACION" && !lc.cronogramaConsensuadoAt) {
      const idle = daysSince(lc.lastGateAt ?? lc.projectCreatedAt);
      if (idle !== null && idle >= CRONOGRAMA_CONSENSUS_GRACE_DAYS) {
        stageAlarms.push({
          key: "cronograma_sin_consensuar",
          label: `Cronograma sin consensuar hace ${idle}d`,
          days: idle,
        });
      }
    }
    if (scheduleAlarmsActive && !hasBaseline) {
      const idle = daysSince(lc.cronogramaConsensuadoAt ?? lc.lastGateAt) ?? 0;
      stageAlarms.push({
        key: "sin_baseline",
        label: "Cronograma sin línea base publicada",
        days: idle,
      });
    }
  }

  // ── Salud derivada ──
  // CAMBIO DE CONTRATO (ciclo de vida): la cascada derivada YA NO produce EN_RIESGO.
  // Las señales duras (fases vencidas / sin avance) derivan EN_FRICCION + riskCandidate
  // — el watchdog PROPONE EN_RIESGO (Project.healthProposed) y el CSE lo confirma
  // escribiendo healthStatusOverride. EN_RIESGO solo existe curado por humano.
  const riskCandidate = scheduleAlarmsActive && !isCompleted && input.status !== "paused" && (overduePhases > 0 || stalled);
  let derived: ProjectHealth;
  if (input.status === "paused") {
    derived = "PAUSADO";
  } else if (isCompleted) {
    derived = "SALUDABLE"; // terminado → no se marca como riesgo
  } else if (riskCandidate) {
    derived = "EN_FRICCION";
  } else if (
    scheduleAlarmsActive &&
    (overdueTasks > 0 || weakBaseline || (scope.exceeded && !scope.attenuated))
  ) {
    derived = "EN_FRICCION";
  } else if (stageAlarms.length > 0) {
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
    scheduleAlarmsActive,
    stage,
    stageAlarms,
    riskCandidate,
  };
}
