/**
 * lib/timeline/baseline.ts
 *
 * D.3 fundación — congela el "baseline VENDIDO" del cronograma al PUBLICAR al cliente.
 * Arma un snapshot prístino (estructura + fechas PLANEADAS por ítem + needsValidation +
 * source) y un resumen de FIRMEZA, y lo versiona en TimelineBaseline. Reusa la convención
 * semanas→fechas de lib/timeline/weeks.ts (única fuente de la conversión).
 *
 * Versionado: cada publish con una PROMESA distinta crea una versión nueva (isActive=true)
 * y desactiva la anterior; si la promesa no cambió, no hace nada (evita ruido por
 * unpublish→publish o republish tras avance). D.3 (después) compara contra la versión activa.
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import type {
  TimelineActivityType,
  TimelinePhaseSource,
  TimelineTaskStatus,
} from "@prisma/client";
import { computePhaseRanges, addWeeks } from "@/lib/timeline/weeks";

// ── Shape del snapshot frozen ─────────────────────────────────────────────────

interface BaselineTask {
  id: string;
  title: string;
  weekIndex: number;
  order: number;
  source: TimelinePhaseSource;
  needsValidation: boolean; // CRÍTICO — qué tareas eran relleno del agente (firmeza por ítem)
  status: TimelineTaskStatus; // estado al congelar (normalmente PENDING)
  plannedStart: string | null; // ISO; null si no hay anchor
  plannedEnd: string | null;
}
interface BaselinePhase {
  id: string;
  name: string;
  order: number;
  durationWeeks: number;
  sessionCount: number | null;
  activityType: TimelineActivityType | null;
  source: TimelinePhaseSource; // AGENT|MODIFIED|HUMAN — firmeza de la fase
  status: TimelineTaskStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  tasks: BaselineTask[];
}
export interface BaselineSnapshot {
  anchorStartDate: string | null;
  phases: BaselinePhase[];
}
export interface BaselineFirmness {
  taskCount: number;
  needsValidationCount: number;
  firmPct: number | null; // 1 - needsValidation/taskCount; null si no hay tareas
  label: "FIRM" | "MIXED" | "WEAK";
  agentUntouchedPhases: number; // fases source=AGENT sin tocar por humano
  handoffConfirmedAtFreeze: boolean; // ¿había handoff confirmado? (insumo del agente de detalle)
}

// Filas leídas del timeline (fases ordenadas por order; tareas por weekIndex/order).
interface PhaseRow {
  id: string;
  name: string;
  order: number;
  durationWeeks: number;
  sessionCount: number | null;
  activityType: TimelineActivityType | null;
  source: TimelinePhaseSource;
  status: TimelineTaskStatus;
  tasks: Array<{
    id: string;
    title: string;
    weekIndex: number;
    order: number;
    source: TimelinePhaseSource;
    needsValidation: boolean;
    status: TimelineTaskStatus;
  }>;
}

/**
 * Arma el snapshot frozen + la firmeza self-contained (sin el flag de handoff, que
 * requiere una query aparte). Las fechas planeadas se PRE-CALCULAN y se congelan acá
 * (inmunes a cambios posteriores de anchor o de la convención).
 */
export function buildBaselineSnapshot(
  anchorStartDate: Date | null,
  phases: PhaseRow[],
): { snapshot: BaselineSnapshot; firmness: Omit<BaselineFirmness, "handoffConfirmedAtFreeze"> } {
  const anchorIso = anchorStartDate ? anchorStartDate.toISOString() : null;
  const ranges = computePhaseRanges(phases); // fases YA ordenadas por order

  const snapPhases: BaselinePhase[] = phases.map((p, i) => {
    const r = ranges[i];
    return {
      id: p.id,
      name: p.name,
      order: p.order,
      durationWeeks: p.durationWeeks,
      sessionCount: p.sessionCount,
      activityType: p.activityType,
      source: p.source,
      status: p.status,
      plannedStart: anchorIso ? addWeeks(anchorIso, r.start).toISOString() : null,
      plannedEnd: anchorIso ? addWeeks(anchorIso, r.end).toISOString() : null,
      tasks: p.tasks.map((t) => {
        const absWeek = r.start + t.weekIndex;
        return {
          id: t.id,
          title: t.title,
          weekIndex: t.weekIndex,
          order: t.order,
          source: t.source,
          needsValidation: t.needsValidation,
          status: t.status,
          plannedStart: anchorIso ? addWeeks(anchorIso, absWeek).toISOString() : null,
          plannedEnd: anchorIso ? addWeeks(anchorIso, absWeek + 1).toISOString() : null,
        };
      }),
    };
  });

  let taskCount = 0;
  let needsValidationCount = 0;
  for (const p of snapPhases) {
    for (const t of p.tasks) {
      taskCount++;
      if (t.needsValidation) needsValidationCount++;
    }
  }
  const firmPct = taskCount > 0 ? Number((1 - needsValidationCount / taskCount).toFixed(3)) : null;
  const agentUntouchedPhases = snapPhases.filter((p) => p.source === "AGENT").length;
  const label: BaselineFirmness["label"] =
    taskCount === 0
      ? "WEAK"
      : needsValidationCount === 0
        ? "FIRM"
        : (firmPct as number) < 0.5
          ? "WEAK"
          : "MIXED";

  return {
    snapshot: { anchorStartDate: anchorIso, phases: snapPhases },
    firmness: { taskCount, needsValidationCount, firmPct, label, agentUntouchedPhases },
  };
}

// Proyección "PROMESA" para dedup de versiones: ignora `status` (ejecución), compara
// solo lo que define lo vendido (estructura + fechas planeadas + needsValidation + source).
function planFingerprint(s: BaselineSnapshot): string {
  return JSON.stringify({
    anchorStartDate: s.anchorStartDate,
    phases: s.phases.map((p) => ({
      id: p.id,
      name: p.name,
      order: p.order,
      durationWeeks: p.durationWeeks,
      sessionCount: p.sessionCount,
      activityType: p.activityType,
      source: p.source,
      plannedStart: p.plannedStart,
      plannedEnd: p.plannedEnd,
      tasks: p.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        weekIndex: t.weekIndex,
        order: t.order,
        source: t.source,
        needsValidation: t.needsValidation,
        plannedStart: t.plannedStart,
        plannedEnd: t.plannedEnd,
      })),
    })),
  });
}

/**
 * Congela el baseline al publicar. Versionado con dedup por promesa.
 * Devuelve { created, version }. No hace nada si el timeline no existe o no tiene fases.
 */
export async function freezeBaselineOnPublish(
  projectId: string,
  publishedByEmail: string | null,
): Promise<{ created: boolean; version: number | null }> {
  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: {
      id: true,
      anchorStartDate: true,
      phases: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          name: true,
          order: true,
          durationWeeks: true,
          sessionCount: true,
          activityType: true,
          source: true,
          status: true,
          tasks: {
            orderBy: [{ weekIndex: "asc" }, { order: "asc" }],
            select: {
              id: true,
              title: true,
              weekIndex: true,
              order: true,
              source: true,
              needsValidation: true,
              status: true,
            },
          },
        },
      },
    },
  });
  if (!tl || tl.phases.length === 0) return { created: false, version: null };

  const { snapshot, firmness } = buildBaselineSnapshot(tl.anchorStartDate, tl.phases);
  const handoffConfirmedAtFreeze =
    (await prisma.canvasBlock.count({
      where: { status: "CONFIRMED", section: { canvas: { projectId, name: "Handoff" } } },
    })) > 0;
  const fullFirmness: BaselineFirmness = { ...firmness, handoffConfirmedAtFreeze };

  const newPlan = planFingerprint(snapshot);
  const active = await prisma.timelineBaseline.findFirst({
    where: { timelineId: tl.id, isActive: true },
    select: { snapshot: true, version: true },
  });
  if (active && planFingerprint(active.snapshot as unknown as BaselineSnapshot) === newPlan) {
    return { created: false, version: active.version }; // promesa idéntica → no versionar
  }

  const maxVer = await prisma.timelineBaseline.aggregate({
    where: { timelineId: tl.id },
    _max: { version: true },
  });
  const nextVersion = (maxVer._max.version ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    await tx.timelineBaseline.updateMany({
      where: { timelineId: tl.id, isActive: true },
      data: { isActive: false },
    });
    await tx.timelineBaseline.create({
      data: {
        timelineId: tl.id,
        version: nextVersion,
        isActive: true,
        anchorStartDate: tl.anchorStartDate,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        firmness: fullFirmness as unknown as Prisma.InputJsonValue,
        publishedByEmail,
      },
    });
  });
  return { created: true, version: nextVersion };
}
