import { Prisma } from "@prisma/client";
import type { TimelineTaskStatus, TaskParty, TimelineTaskType } from "@prisma/client";
import { actualDatesPatch } from "./actual-dates";
import { patchBaselinePhaseTasks } from "./baseline";
import { isKept } from "./regen-columnas";
import { PARTY_VALUES, TASK_TYPE_VALUES } from "./validate";

/**
 * lib/timeline/apply-curated-phase.ts
 *
 * Extraído de app/api/projects/[projectId]/timeline/phases/[phaseId]/apply/route.ts (Tanda N)
 * para poder aplicar el set curado de MÁS DE UNA fase en una sola transacción ("Regenerar
 * todo el cronograma") sin duplicar la lógica. El endpoint por-fase pasa a llamar estos mismos
 * helpers — comportamiento externo idéntico, cero cambio de conducta.
 *
 * ── LA PROMESA QUE NO SE CUMPLÍA (2026-08-11) ────────────────────────────────
 * El docblock del apply-all decía —y la pantalla da a entender— que regenerar "nunca borra
 * tareas con progreso o cargadas a mano". Era cierto en el CLIENTE: `isKept` pre-siembra esas
 * tareas en la columna que se conserva (`regen-columnas.ts`), así que el payload normalmente
 * las trae. Pero acá, en el servidor, el borrado era `todo lo que no vino en el payload` — sin
 * mirar `status`, `actualStart` ni `source`. O sea que la única barrera era que la UI se
 * portara bien.
 *
 * Alcanza con que el payload llegue incompleto para perder trabajo real e irrecuperable: una
 * sección del acordeón que no montó, un request viejo reenviado, una corrida a medias, o
 * cualquier caller que no sea ese modal. La regla ahora vive DEL LADO QUE ESCRIBE: una tarea
 * protegida por `isKept` no se borra aunque el payload la omita (ver `repartoDeBorrado`).
 * El cliente sigue haciendo su parte — pasa a ser la segunda red, no la única.
 */

const STATUSES = ["PENDING", "IN_PROGRESS", "DONE", "SUSPENDED"] as const;

export interface CuratedTaskInput {
  id?: string;
  title: string;
  weekIndex: number;
  order: number;
  notes: string | null;
  party: TaskParty | null;
  type: TimelineTaskType | null;
  status: TimelineTaskStatus;
}

/**
 * Normaliza/valida el set curado de UNA fase. PURO — idéntico al loop que vivía inline en
 * phases/[phaseId]/apply/route.ts. `existingIds` son los ids de tareas que YA pertenecen a
 * esta fase — un `id` que no está ahí se descarta (anti-alucinación: no puede colarse como
 * update sobre una tarea ajena).
 */
export function normalizeCuratedTasks(
  rawTasks: unknown[],
  durationWeeks: number,
  existingIds: Set<string>,
): CuratedTaskInput[] {
  const perWeek = new Map<number, number>();
  const curated: CuratedTaskInput[] = [];
  for (const raw of rawTasks) {
    if (!raw || typeof raw !== "object") continue;
    const t = raw as Record<string, unknown>;
    const title = typeof t.title === "string" ? t.title.trim() : "";
    if (!title) continue;
    const id = typeof t.id === "string" && existingIds.has(t.id) ? t.id : undefined;
    const wRaw = typeof t.weekIndex === "number" && Number.isInteger(t.weekIndex) ? t.weekIndex : 0;
    const weekIndex = Math.min(Math.max(wRaw, 0), Math.max(durationWeeks - 1, 0));
    const order = perWeek.get(weekIndex) ?? 0;
    perWeek.set(weekIndex, order + 1);
    const partyRaw = typeof t.party === "string" ? t.party.toUpperCase() : "";
    const party = (PARTY_VALUES as readonly string[]).includes(partyRaw) ? (partyRaw as TaskParty) : null;
    const typeRaw = typeof t.type === "string" ? t.type.toUpperCase() : "";
    const type = (TASK_TYPE_VALUES as readonly string[]).includes(typeRaw) ? (typeRaw as TimelineTaskType) : null;
    const statusRaw = typeof t.status === "string" ? t.status.toUpperCase() : "";
    const status = (STATUSES as readonly string[]).includes(statusRaw) ? (statusRaw as TimelineTaskStatus) : "PENDING";
    curated.push({
      id,
      title,
      weekIndex,
      order,
      notes: typeof t.notes === "string" && t.notes.trim() ? t.notes.trim() : null,
      party,
      type,
      status,
    });
  }
  return curated;
}

export interface ExistingTaskRow {
  id: string;
  title: string;
  weekIndex: number;
  order: number;
  notes: string | null;
  party: TaskParty | null;
  type: TimelineTaskType | null;
  source: string;
  status: TimelineTaskStatus;
  actualStart: Date | null;
}

/**
 * Qué se borra de verdad cuando el payload curado omite tareas. PURA — es la decisión que antes
 * estaba inline y sin red (`existingTasks.filter(t => !keptIds.has(t.id))` a secas).
 *
 * Una tarea omitida se borra SOLO si es material reemplazable: pendiente y de la IA. Si tiene
 * progreso humano encima —iniciada, hecha, suspendida o cargada a mano— se PRESERVA aunque no
 * venga en el payload, y se reporta. Misma regla `isKept` que usa el modal de curación para
 * decidir qué pre-acepta: una sola definición de "esto no se toca", en `regen-columnas.ts`.
 *
 * Las preservadas conservan su `weekIndex`/`order` actuales: la renumeración por semana solo
 * corre sobre el set curado, así que quedan ordenadas después de las curadas de su semana. Es
 * la conducta correcta para un camino de excepción — si el payload omitió una tarea protegida,
 * algo salió mal aguas arriba y lo que importa es no perderla, no dónde queda ubicada.
 */
export function repartoDeBorrado(
  existingTasks: readonly ExistingTaskRow[],
  keptIds: ReadonlySet<string>,
): { aBorrar: string[]; preservadas: ExistingTaskRow[] } {
  const omitidas = existingTasks.filter((t) => !keptIds.has(t.id));
  return {
    aBorrar: omitidas.filter((t) => !isKept(t)).map((t) => t.id),
    preservadas: omitidas.filter(isKept),
  };
}

/**
 * Aplica el set curado de UNA fase dentro de una $transaction abierta por el caller: delete lo
 * que quedó fuera del set, update lo que cambió (flip AGENT→MODIFIED si cambió el contenido;
 * status vía actualDatesPatch si cambió), create lo nuevo, patch del baseline si el proyecto está
 * publicado, y recálculo de auto-cierre/reapertura de la fase. DB-coupled — sin test directo,
 * mismo criterio que patchBaselinePhaseTasks (baseline.test.ts la excluye a propósito). NO toca
 * ProjectTimeline (lastEditedByHuman/pendingProgress) — eso lo hace el caller UNA sola vez, sea
 * tras una fase o tras todas.
 */
export async function applyCuratedPhaseTasks(
  tx: Prisma.TransactionClient,
  params: {
    phaseId: string;
    timelineId: string;
    existingTasks: ExistingTaskRow[];
    curated: CuratedTaskInput[];
    now: Date;
    actorEmail: string | null;
  },
): Promise<{ preservadasPorProgreso: number }> {
  const { phaseId, timelineId, existingTasks, curated, now, actorEmail } = params;
  const existingById = new Map(existingTasks.map((t) => [t.id, t]));
  const keptIds = new Set(curated.filter((c) => c.id).map((c) => c.id as string));

  const { aBorrar, preservadas } = repartoDeBorrado(existingTasks, keptIds);
  if (aBorrar.length > 0) {
    await tx.timelineTask.deleteMany({ where: { id: { in: aBorrar } } });
  }

  const toCreate: Prisma.TimelineTaskCreateManyInput[] = [];
  for (const c of curated) {
    if (c.id) {
      const prev = existingById.get(c.id)!;
      const contentChanged =
        prev.title !== c.title ||
        prev.weekIndex !== c.weekIndex ||
        prev.order !== c.order ||
        (prev.notes ?? null) !== c.notes ||
        (prev.party ?? null) !== c.party ||
        (prev.type ?? null) !== c.type;
      const statusChanged = prev.status !== c.status;
      await tx.timelineTask.update({
        where: { id: c.id },
        data: {
          title: c.title,
          weekIndex: c.weekIndex,
          order: c.order,
          notes: c.notes,
          party: c.party,
          type: c.type,
          ...(contentChanged && prev.source === "AGENT" ? { source: "MODIFIED" as const, needsValidation: false } : {}),
          ...(statusChanged
            ? {
                status: c.status,
                statusSource: "HUMAN" as const,
                statusChangedByEmail: actorEmail,
                statusChangedAt: now,
                ...actualDatesPatch(c.status, { actualStart: prev.actualStart }),
              }
            : {}),
        },
      });
    } else {
      const dates = actualDatesPatch(c.status, { actualStart: null }, now);
      toCreate.push({
        phaseId,
        title: c.title,
        weekIndex: c.weekIndex,
        order: c.order,
        notes: c.notes,
        party: c.party,
        type: c.type,
        needsValidation: false,
        source: "AGENT",
        status: c.status,
        ...(c.status !== "PENDING"
          ? { statusSource: "HUMAN" as const, statusChangedByEmail: actorEmail, statusChangedAt: now, ...dates }
          : {}),
      });
    }
  }
  if (toCreate.length > 0) {
    await tx.timelineTask.createMany({ data: toCreate });
  }

  await patchBaselinePhaseTasks(tx, timelineId, phaseId);

  const after = await tx.timelinePhase.findUnique({
    where: { id: phaseId },
    select: { status: true, actualStart: true, tasks: { select: { status: true } } },
  });
  if (after && after.tasks.length > 0) {
    const allResolved = after.tasks.every((t) => t.status === "DONE" || t.status === "SUSPENDED");
    const meta = { statusSource: "HUMAN" as const, statusChangedByEmail: actorEmail, statusChangedAt: now };
    if (allResolved && after.status !== "DONE") {
      await tx.timelinePhase.update({
        where: { id: phaseId },
        data: { status: "DONE", actualEnd: now, ...(after.actualStart ? {} : { actualStart: now }), ...meta },
      });
    } else if (!allResolved && after.status === "DONE") {
      await tx.timelinePhase.update({ where: { id: phaseId }, data: { status: "IN_PROGRESS", ...meta } });
    }
  }

  return { preservadasPorProgreso: preservadas.length };
}
