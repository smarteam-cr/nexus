/**
 * lib/timeline/una-tarea.ts — las operaciones de UNA tarea del cronograma, una sola vez para todo cronograma (2026-11-26).
 * SERVIDOR.
 *
 * Un cronograma es de un proyecto o de un plan general (ProjectTimeline.projectId | planId, DECISIONS «El plan general es
 * un objeto de la cuenta»). Las reglas de una tarea son las mismas en los dos: lo único que cambia es DÓNDE se busca el
 * cronograma (`DuenoDelCronograma`). Las rutas del proyecto (`/api/projects/[projectId]/timeline/tasks…`) y las del plan
 * (`/api/clients/[id]/plan-general/tasks…`) llaman a estas funciones después de su guarda, y se quedan con lo que es de
 * cada una: el vigía de Éxito del cliente y «¿cuánto te tomó?» son de un proyecto (TimelineEvent pide `projectId`).
 *
 * Ownership por traversal en TODA operación: la tarea (o la fase) tiene que ser del cronograma de ESE dueño; no alcanza
 * con que exista el id. Una tarea solo se mueve a otra fase de su MISMO cronograma.
 *
 * Extraído TAL CUAL de las tres rutas del proyecto (POST tasks, PATCH tasks/[taskId], PATCH/DELETE tasks/[taskId]/campos):
 * mismos cuerpos de error y mismas escrituras.
 */
import "server-only";
import type { TaskParty, TimelineTaskStatus, TimelineTaskType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { actualDatesPatch } from "@/lib/timeline/actual-dates";
import { semanasQueCaben } from "@/lib/timeline/weeks";
import { PARTY_VALUES as PARTIES, TASK_TYPE_VALUES as TYPES } from "@/lib/timeline/validate";
import { esInstanteDeProyecto } from "@/lib/timeline/fecha-de-arranque";

/** De quién es el cronograma donde se busca la tarea. */
export type DuenoDelCronograma = { projectId: string } | { planId: string };

/** El filtro de `ProjectTimeline` por su dueño (para `timeline: …` en un where). */
export function cronogramaDe(d: DuenoDelCronograma): { projectId: string } | { planId: string } {
  return "projectId" in d ? { projectId: d.projectId } : { planId: d.planId };
}

const enEste = (d: DuenoDelCronograma) => ("projectId" in d ? "en este proyecto" : "en este plan");

export type Resultado<T> = { ok: true; valor: T } | { ok: false; status: number; error: string };
const falla = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });

const STATUSES = ["PENDING", "IN_PROGRESS", "DONE", "SUSPENDED"] as const;

// ─── Crear ───────────────────────────────────────────────────────────────────

export interface PedidoDeTarea {
  phaseId: string;
  title: string;
  weekIndex: number;
  party: TaskParty | null;
  type: TimelineTaskType | null;
  semanas: number | null;
}

/** El cuerpo de «+ tarea»: phaseId, título y semana obligatorios; responsable, tipo y duración opcionales. */
export function leerPedidoDeTarea(raw: unknown): Resultado<PedidoDeTarea> {
  const body = raw as { phaseId?: unknown; title?: unknown; weekIndex?: unknown; party?: unknown; type?: unknown; semanas?: unknown } | null;
  const phaseId = typeof body?.phaseId === "string" ? body.phaseId : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const weekIndex = body?.weekIndex;
  if (!phaseId) return falla(400, "phaseId requerido");
  if (!title) return falla(400, "El título de la tarea es obligatorio");
  if (typeof weekIndex !== "number" || !Number.isInteger(weekIndex) || weekIndex < 0) return falla(400, "weekIndex debe ser un entero ≥ 0");
  const party = typeof body?.party === "string" && (PARTIES as readonly string[]).includes(body.party) ? (body.party as TaskParty) : null;
  const type = typeof body?.type === "string" && (TYPES as readonly string[]).includes(body.type) ? (body.type as TimelineTaskType) : null;
  return { ok: true, valor: { phaseId, title, weekIndex, party, type, semanas: typeof body?.semanas === "number" ? body.semanas : null } };
}

/**
 * Agrega UNA tarea a una fase del cronograma del dueño. Nace `source=HUMAN`, `status=PENDING`, al final de su semana. La
 * semana se recorta a la fase y la duración a lo que queda de ella (`semanasQueCaben`; 1 se guarda como null).
 */
export async function crearTarea(d: DuenoDelCronograma, p: PedidoDeTarea) {
  const phase = await prisma.timelinePhase.findFirst({
    where: { id: p.phaseId, timeline: cronogramaDe(d) },
    select: { id: true, durationWeeks: true, timelineId: true },
  });
  if (!phase) return falla(404, `Fase no encontrada ${enEste(d)}`);
  const weekIndex = Math.min(p.weekIndex, Math.max(phase.durationWeeks - 1, 0));
  const semanas = semanasQueCaben(p.semanas, weekIndex, phase.durationWeeks);
  const order = await prisma.timelineTask.count({ where: { phaseId: p.phaseId, weekIndex } });
  const task = await prisma.timelineTask.create({
    data: { phaseId: p.phaseId, title: p.title, weekIndex, order, party: p.party, type: p.type, source: "HUMAN", status: "PENDING", semanas },
    select: { id: true, title: true, weekIndex: true, order: true, party: true, type: true, status: true, source: true, semanas: true },
  });
  return { ok: true as const, valor: { task, timelineId: phase.timelineId } };
}

// ─── Estado ──────────────────────────────────────────────────────────────────

export function leerEstado(raw: unknown): Resultado<TimelineTaskStatus> {
  const status = (raw as { status?: unknown } | null)?.status;
  if (typeof status !== "string" || !(STATUSES as readonly string[]).includes(status)) {
    return falla(400, `status debe ser uno de ${STATUSES.join("|")}`);
  }
  return { ok: true, valor: status as TimelineTaskStatus };
}

/**
 * Cambia el estado de UNA tarea y, por coherencia, el de su fase: una fase CON tareas queda DONE sii TODAS están
 * resueltas (DONE/SUSPENDED); si deja de estarlo y estaba DONE, reabre a IN_PROGRESS. Fechas reales monótonas. No flipea
 * `source` ni toca `lastEditedByHuman` (reglas D.1). Devuelve lo de antes para el vigía y los tiempos de quien llama.
 */
export async function cambiarEstadoDeTarea(d: DuenoDelCronograma, taskId: string, status: TimelineTaskStatus, email: string | null) {
  const task = await prisma.timelineTask.findFirst({
    where: { id: taskId, phase: { timeline: cronogramaDe(d) } },
    select: { id: true, title: true, status: true, actualStart: true, phaseId: true, phase: { select: { timelineId: true } } },
  });
  if (!task) return falla(404, `Tarea no encontrada ${enEste(d)}`);

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.timelineTask.update({
      where: { id: taskId },
      data: {
        status,
        // Check manual → procedencia HUMAN (incluye el desmarcado a PENDING: decisión humana explícita).
        statusSource: "HUMAN",
        statusChangedByEmail: email,
        statusChangedAt: now,
        ...actualDatesPatch(status, { actualStart: task.actualStart }),
      },
      select: { id: true, status: true, actualStart: true, actualEnd: true, updatedAt: true },
    });
    const phase = await tx.timelinePhase.findUnique({
      where: { id: task.phaseId },
      select: { status: true, actualStart: true, tasks: { select: { status: true } } },
    });
    if (phase && phase.tasks.length > 0) {
      const allResolved = phase.tasks.every((t) => t.status === "DONE" || t.status === "SUSPENDED");
      // El cambio de estado de la fase es DERIVADO de la acción humana → también HUMAN.
      const meta = { statusSource: "HUMAN" as const, statusChangedByEmail: email, statusChangedAt: now };
      if (allResolved && phase.status !== "DONE") {
        await tx.timelinePhase.update({
          where: { id: task.phaseId },
          data: { status: "DONE", actualEnd: now, ...(phase.actualStart ? {} : { actualStart: now }), ...meta },
        });
      } else if (!allResolved && phase.status === "DONE") {
        await tx.timelinePhase.update({ where: { id: task.phaseId }, data: { status: "IN_PROGRESS", ...meta } });
      }
    }
    return u;
  });
  return { ok: true as const, valor: { updated, antes: { id: task.id, title: task.title, status: task.status }, timelineId: task.phase.timelineId, ahora: now } };
}

// ─── Campos ──────────────────────────────────────────────────────────────────

export interface CamposDeTarea {
  data: {
    title?: string;
    notes?: string | null;
    party?: TaskParty | null;
    type?: TimelineTaskType | null;
    startDateOverride?: Date | null;
    dueDateOverride?: Date | null;
  };
  weekIndex?: number;
  semanas?: number | null;
  order?: number;
  phaseId?: string;
}

function entero(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return typeof v === "number" && Number.isInteger(v) ? v : NaN;
}

/** undefined = no viene; null = volver a la automática; Date = fijar; false = inválida. La MISMA regla que el PUT
 *  (validate.ts): una fecha que se entiende y cae en el rango de un proyecto (esInstanteDeProyecto). */
function fecha(v: unknown): Date | null | undefined | false {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v)) || !esInstanteDeProyecto(v)) return false;
  return new Date(v);
}

/** El cuerpo del PATCH de campos. Lo que no viene no se toca; el estado NO va acá. */
export function leerCamposDeTarea(raw: unknown): Resultado<CamposDeTarea> {
  if (!raw || typeof raw !== "object") return falla(400, "JSON inválido");
  const r = raw as Record<string, unknown>;
  const data: CamposDeTarea["data"] = {};
  if (r.title !== undefined) {
    const t = typeof r.title === "string" ? r.title.trim() : "";
    if (!t) return falla(400, "La tarea necesita un título.");
    data.title = t;
  }
  if (r.notes !== undefined) {
    if (r.notes !== null && typeof r.notes !== "string") return falla(400, "notes debe ser texto");
    data.notes = typeof r.notes === "string" && r.notes.trim() ? r.notes.trim() : null;
  }
  if (r.party !== undefined) {
    if (r.party !== null && !(PARTIES as readonly unknown[]).includes(r.party)) return falla(400, "Responsable desconocido");
    data.party = r.party as TaskParty | null;
  }
  if (r.type !== undefined) {
    if (r.type !== null && !(TYPES as readonly unknown[]).includes(r.type)) return falla(400, "Tipo desconocido");
    data.type = r.type as TimelineTaskType | null;
  }
  for (const k of ["startDateOverride", "dueDateOverride"] as const) {
    const f = fecha(r[k]);
    if (f === false) return falla(400, `${k} debe ser una fecha (aaaa-mm-dd)`);
    if (f !== undefined) data[k] = f;
  }
  const weekIndex = entero(r.weekIndex);
  const semanas = entero(r.semanas);
  const order = entero(r.order);
  if (Number.isNaN(weekIndex) || weekIndex === null || (weekIndex != null && weekIndex < 0)) return falla(400, "weekIndex debe ser un entero ≥ 0");
  if (Number.isNaN(semanas) || (semanas != null && semanas < 1)) return falla(400, "semanas debe ser un entero ≥ 1");
  if (Number.isNaN(order) || order === null || (order != null && order < 0)) return falla(400, "order debe ser un entero ≥ 0");
  const phaseId = r.phaseId === undefined ? undefined : typeof r.phaseId === "string" && r.phaseId ? r.phaseId : null;
  if (phaseId === null) return falla(400, "phaseId inválido");
  const mueve = weekIndex !== undefined || phaseId !== undefined || order !== undefined;
  if (Object.keys(data).length === 0 && semanas === undefined && !mueve) return falla(400, "Nada que cambiar");
  return {
    ok: true,
    valor: {
      data,
      ...(weekIndex !== undefined ? { weekIndex } : {}),
      ...(semanas !== undefined ? { semanas } : {}),
      ...(order !== undefined ? { order } : {}),
      ...(phaseId !== undefined ? { phaseId } : {}),
    },
  };
}

/**
 * Edita los campos de UNA tarea. La tarea tiene que caber en su fase: `semanas` se recorta a lo que queda (como el PUT)
 * y un `weekIndex` fuera de la fase es 400. `phaseId` la mueve a otra fase del MISMO cronograma y `order` la pone en ese
 * lugar de su semana. Editarla es revisarla: deja de estar «por validar» y una tarea de la IA pasa a MODIFIED. Marca
 * `lastEditedByHuman` del cronograma.
 */
export async function editarCamposDeTarea(d: DuenoDelCronograma, taskId: string, c: CamposDeTarea) {
  const mueve = c.weekIndex !== undefined || c.phaseId !== undefined || c.order !== undefined;
  const task = await prisma.timelineTask.findFirst({
    where: { id: taskId, phase: { timeline: cronogramaDe(d) } },
    select: {
      id: true,
      title: true,
      weekIndex: true,
      order: true,
      semanas: true,
      source: true,
      phaseId: true,
      phase: { select: { durationWeeks: true, timelineId: true } },
    },
  });
  if (!task) return falla(404, `Tarea no encontrada ${enEste(d)}`);

  let fase = { id: task.phaseId, durationWeeks: task.phase.durationWeeks };
  if (c.phaseId !== undefined && c.phaseId !== task.phaseId) {
    const otra = await prisma.timelinePhase.findFirst({
      where: { id: c.phaseId, timelineId: task.phase.timelineId },
      select: { id: true, durationWeeks: true },
    });
    if (!otra) return falla(400, "Una tarea solo se mueve a otra fase de su mismo cronograma.");
    fase = otra;
  }
  const semanaFinal = c.weekIndex ?? task.weekIndex;
  if (mueve && semanaFinal > Math.max(fase.durationWeeks - 1, 0)) {
    return falla(400, `La fase tiene ${fase.durationWeeks} ${fase.durationWeeks === 1 ? "semana" : "semanas"}: la tarea no puede arrancar en la ${semanaFinal + 1}.`);
  }
  // Cuánto dura: lo pedido o lo que tenía, recortado a lo que queda de la fase (mover no la estira, ni la saca).
  const semanasFinal =
    c.semanas !== undefined || mueve ? semanasQueCaben(c.semanas !== undefined ? c.semanas : task.semanas, semanaFinal, fase.durationWeeks) : undefined;

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.timelineTask.update({
      where: { id: taskId },
      data: {
        ...c.data,
        ...(semanasFinal !== undefined ? { semanas: semanasFinal } : {}),
        ...(mueve ? { phaseId: fase.id, weekIndex: semanaFinal } : {}),
        needsValidation: false,
        ...(task.source === "AGENT" ? { source: "MODIFIED" as const } : {}),
      },
      select: { id: true, title: true, phaseId: true, weekIndex: true, semanas: true, updatedAt: true },
    });
    if (mueve) {
      // El lugar dentro de su semana: `order` pedido, o al final si cambió de semana o de fase; los demás se corren.
      const hermanas = await tx.timelineTask.findMany({
        where: { phaseId: fase.id, weekIndex: semanaFinal, id: { not: taskId } },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      const mismaSemana = fase.id === task.phaseId && semanaFinal === task.weekIndex;
      const lugar = Math.min(c.order ?? (mismaSemana ? task.order : hermanas.length), hermanas.length);
      const ids = [...hermanas.map((h) => h.id)];
      ids.splice(lugar, 0, taskId);
      for (let i = 0; i < ids.length; i++) await tx.timelineTask.update({ where: { id: ids[i] }, data: { order: i } });
    }
    await tx.projectTimeline.update({ where: { id: task.phase.timelineId }, data: { lastEditedByHuman: now } });
    return t;
  });

  const movida = mueve && (updated.weekIndex !== task.weekIndex || updated.phaseId !== task.phaseId);
  const cambiaDuracion = semanasFinal !== undefined && semanasFinal !== (task.semanas ?? null);
  return {
    ok: true as const,
    valor: { updated, antes: { id: task.id, weekIndex: task.weekIndex, semanas: task.semanas ?? null }, timelineId: task.phase.timelineId, movida, cambiaDuracion },
  };
}

// ─── Borrar ──────────────────────────────────────────────────────────────────

export async function borrarTarea(d: DuenoDelCronograma, taskId: string) {
  const task = await prisma.timelineTask.findFirst({
    where: { id: taskId, phase: { timeline: cronogramaDe(d) } },
    select: { id: true, title: true, phase: { select: { timelineId: true } } },
  });
  if (!task) return falla(404, `Tarea no encontrada ${enEste(d)}`);
  await prisma.$transaction([
    prisma.timelineTask.delete({ where: { id: taskId } }),
    prisma.projectTimeline.update({ where: { id: task.phase.timelineId }, data: { lastEditedByHuman: new Date() } }),
  ]);
  return { ok: true as const, valor: { id: task.id, title: task.title, timelineId: task.phase.timelineId } };
}
