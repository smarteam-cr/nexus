/**
 * lib/plan-general/plan.ts — las escrituras del plan general como objeto de la cuenta (2026-11-26). SERVIDOR.
 *
 * DECISIONS «El plan general es un objeto de la cuenta»: el plan (`PlanGeneral`, uno por cuenta) nace con su cronograma
 * (`ProjectTimeline.planId`) en la misma transacción, con lo primero que se guarda: una fase propia, la lista de
 * proyectos, el arranque o el acceso del cliente. Nace con los proyectos que la cuenta ya mostraba (los que tienen
 * loops) y con su arranque, así crear el plan no cambia lo que se ve. Pide el permiso quien llama (guardPlanEdit /
 * guardPlanDelete). Las tareas de una fase propia van por lib/timeline/una-tarea.ts, como las de cualquier cronograma.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { semanasQueCaben } from "@/lib/timeline/weeks";
import { anclaComun } from "./armar";
import { PROYECTO_DEL_PLAN } from "./leer";
import type { CambioDeFaseDelPlan, NuevaFaseDelPlan } from "./schema";

export class ErrorDelPlan extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface PlanAsegurado {
  planId: string;
  timelineId: string;
}

/**
 * El plan de la cuenta, creándolo si no existe (con su cronograma). Dos pedidos a la vez crean UNO: la cuenta es única
 * en `PlanGeneral` y el que pierde la carrera lee el que quedó. Un plan sin cronograma (no debería pasar) lo recupera.
 */
export async function asegurarPlan(clientId: string, porEmail: string | null): Promise<PlanAsegurado> {
  const existente = await prisma.planGeneral.findUnique({ where: { clientId }, select: { id: true, cronograma: { select: { id: true } } } });
  if (existente?.cronograma) return { planId: existente.id, timelineId: existente.cronograma.id };
  if (existente) {
    const tl = await prisma.projectTimeline.upsert({
      where: { planId: existente.id },
      create: { planId: existente.id, detailConfirmedAt: new Date() },
      update: {},
      select: { id: true },
    });
    return { planId: existente.id, timelineId: tl.id };
  }
  // Los que la cuenta mostraba hasta acá: sus proyectos con loops, y el arranque más temprano de ellos.
  const conLoops = await prisma.project.findMany({
    where: { ...PROYECTO_DEL_PLAN(clientId), timeline: { phases: { some: { loopNumero: { not: null } } } } },
    select: { id: true, timeline: { select: { anchorStartDate: true } } },
  });
  const ancla = anclaComun(conLoops.map((p) => p.timeline?.anchorStartDate));
  try {
    const creado = await prisma.planGeneral.create({
      data: {
        clientId,
        creadoPor: porEmail,
        proyectos: { create: conLoops.map((p) => ({ projectId: p.id, agregadoPor: porEmail })) },
        // Las tareas del plan las escribe una persona: no hay detalle de la IA que confirmar (el cliente las ve).
        cronograma: { create: { anchorStartDate: ancla ? new Date(ancla) : null, detailConfirmedAt: new Date() } },
      },
      select: { id: true, cronograma: { select: { id: true } } },
    });
    if (!creado.cronograma) throw new Error("El plan se creó sin su cronograma.");
    return { planId: creado.id, timelineId: creado.cronograma.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return asegurarPlan(clientId, porEmail);
    throw e;
  }
}

/**
 * La lista de proyectos del plan, entera (lo que no viene sale). Cada uno tiene que ser de ESTA cuenta, activo y no de
 * prueba (en la etapa 1; la etapa 2 abre las fichas del grupo): si no, 400 y no se toca nada.
 */
export async function fijarProyectosDelPlan(clientId: string, projectIds: readonly string[], porEmail: string | null): Promise<void> {
  const pedidos = [...new Set(projectIds)];
  const validos = await prisma.project.findMany({ where: { ...PROYECTO_DEL_PLAN(clientId), id: { in: pedidos } }, select: { id: true } });
  if (validos.length !== pedidos.length) {
    throw new ErrorDelPlan(400, "Solo entran proyectos activos de esta cuenta.");
  }
  const { planId } = await asegurarPlan(clientId, porEmail);
  await prisma.$transaction([
    prisma.proyectoDelPlan.deleteMany({ where: { planId, projectId: { notIn: pedidos } } }),
    prisma.proyectoDelPlan.createMany({ data: pedidos.map((projectId) => ({ planId, projectId, agregadoPor: porEmail })), skipDuplicates: true }),
  ]);
}

/** El arranque del plan (el `anchorStartDate` de su cronograma). AAAA-MM-DD; null = volver al de los proyectos. */
export async function fijarArranqueDelPlan(clientId: string, arranque: string | null, porEmail: string | null): Promise<void> {
  const { planId, timelineId } = await asegurarPlan(clientId, porEmail);
  if (arranque) {
    /* El plan no arranca DESPUÉS que sus proyectos: el Gantt cuenta desde S0, y un loop que arrancó antes quedaría en
       semanas negativas. Antes, sí (lo transversal puede empezar primero). */
    const primeros = await prisma.project.findMany({
      // Los que se VEN (con loops): el arranque que muestra el Gantt sale de esos mismos.
      where: {
        ...PROYECTO_DEL_PLAN(clientId),
        enPlanesGenerales: { some: { planId } },
        timeline: { anchorStartDate: { not: null }, phases: { some: { loopNumero: { not: null } } } },
      },
      select: { timeline: { select: { anchorStartDate: true } } },
    });
    const primero = anclaComun(primeros.map((p) => p.timeline?.anchorStartDate));
    if (primero && arranque > primero.slice(0, 10)) {
      throw new ErrorDelPlan(400, `El plan no puede arrancar después que sus proyectos: el primero arranca el ${primero.slice(0, 10)}.`);
    }
  }
  await prisma.projectTimeline.update({
    where: { id: timelineId },
    // Como el PUT del cronograma de un proyecto: el día tal cual, a la medianoche UTC.
    data: { anchorStartDate: arranque ? new Date(arranque) : null, lastEditedByHuman: new Date() },
  });
}

/** Una fase propia nueva, al final del cronograma del plan, con su arranque EXPLÍCITO (todas las del plan lo tienen). */
export async function crearFasePropia(clientId: string, f: NuevaFaseDelPlan, porEmail: string | null) {
  const { timelineId } = await asegurarPlan(clientId, porEmail);
  const ultima = await prisma.timelinePhase.aggregate({ where: { timelineId }, _max: { order: true } });
  const fase = await prisma.timelinePhase.create({
    data: {
      timelineId,
      name: f.name,
      order: (ultima._max.order ?? -1) + 1,
      startWeek: f.startWeek,
      durationWeeks: f.durationWeeks,
      loopNumero: f.loopNumero ?? null,
      activityType: f.activityType ?? null,
      source: "HUMAN",
    },
    select: { id: true },
  });
  await prisma.projectTimeline.update({ where: { id: timelineId }, data: { lastEditedByHuman: new Date() } });
  return fase;
}

/** La fase, si es del cronograma del plan de ESTA cuenta (ownership por traversal). */
async function faseDelPlan(clientId: string, faseId: string) {
  return prisma.timelinePhase.findFirst({
    where: { id: faseId, timeline: { plan: { clientId } } },
    select: { id: true, timelineId: true, durationWeeks: true, tasks: { select: { id: true, weekIndex: true, semanas: true } } },
  });
}

/**
 * Edita una fase propia. Acortarla no puede dejar una tarea en una semana que la fase ya no tiene (INV22): eso es 400 y
 * pide moverla antes. Las tareas que se pasaban del nuevo final se recortan (como al moverlas: `semanasQueCaben`).
 */
export async function editarFasePropia(clientId: string, faseId: string, c: CambioDeFaseDelPlan) {
  const fase = await faseDelPlan(clientId, faseId);
  if (!fase) throw new ErrorDelPlan(404, "Fase no encontrada en este plan");
  const duracion = c.durationWeeks ?? fase.durationWeeks;
  const afuera = fase.tasks.filter((t) => t.weekIndex > duracion - 1);
  if (afuera.length > 0) {
    const ultima = Math.max(...afuera.map((t) => t.weekIndex));
    throw new ErrorDelPlan(400, `Hay ${afuera.length === 1 ? "una tarea" : `${afuera.length} tareas`} en la semana ${ultima + 1} de la fase: muévelas antes de acortarla.`);
  }
  const recortes = fase.tasks.flatMap((t) => {
    const cabe = semanasQueCaben(t.semanas, t.weekIndex, duracion);
    return cabe !== (t.semanas && t.semanas > 1 ? t.semanas : null) ? [{ id: t.id, semanas: cabe }] : [];
  });
  await prisma.$transaction([
    prisma.timelinePhase.update({
      where: { id: faseId },
      data: {
        ...(c.name !== undefined ? { name: c.name } : {}),
        ...(c.loopNumero !== undefined ? { loopNumero: c.loopNumero } : {}),
        ...(c.startWeek !== undefined ? { startWeek: c.startWeek } : {}),
        ...(c.durationWeeks !== undefined ? { durationWeeks: c.durationWeeks } : {}),
        ...(c.sessionCount !== undefined ? { sessionCount: c.sessionCount } : {}),
        ...(c.activityType !== undefined ? { activityType: c.activityType } : {}),
      },
    }),
    ...recortes.map((r) => prisma.timelineTask.update({ where: { id: r.id }, data: { semanas: r.semanas } })),
    prisma.projectTimeline.update({ where: { id: fase.timelineId }, data: { lastEditedByHuman: new Date() } }),
  ]);
}

/** Borra una fase propia con sus tareas (las tareas cascadean). Solo del plan de ESTA cuenta. */
export async function borrarFasePropia(clientId: string, faseId: string): Promise<void> {
  const fase = await faseDelPlan(clientId, faseId);
  if (!fase) throw new ErrorDelPlan(404, "Fase no encontrada en este plan");
  await prisma.$transaction([
    prisma.timelinePhase.delete({ where: { id: faseId } }),
    prisma.projectTimeline.update({ where: { id: fase.timelineId }, data: { lastEditedByHuman: new Date() } }),
  ]);
}

/** El id del plan de la cuenta (para las rutas de tareas, que buscan el cronograma por `planId`). null = no hay plan. */
export async function idDelPlan(clientId: string): Promise<string | null> {
  return (await prisma.planGeneral.findUnique({ where: { clientId }, select: { id: true } }))?.id ?? null;
}
