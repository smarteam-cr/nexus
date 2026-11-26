/**
 * lib/plan-general/leer.ts — lee de la base el plan general de una cuenta. Server-only.
 *
 * Con plan guardado (`PlanGeneral`, 2026-11-26) entran los proyectos de SU lista; sin plan, los de antes: los proyectos
 * de la cuenta con al menos un loop (así una cuenta se ve igual entre el deploy y la creación de su plan). En los dos
 * casos solo proyectos ACTIVOS, que no son de prueba y de la MISMA cuenta: la lectura lo vuelve a filtrar aunque la lista
 * diga otra cosa. No lee reuniones: el chokepoint de sesiones (invariante 1) no aplica.
 *
 * Lo que ve el cliente NO se lee acá campo por campo: pasa por el filtro del cronograma externo
 * (lib/external/timeline-view.ts: `readClientTimeline` por proyecto y `readClientTimelineDelPlan` para las fases
 * propias), y después se une (`unirParaElCliente`).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { readClientTimeline, readClientTimelineDelPlan } from "@/lib/external/timeline-view";
import type { ExternalTimelineData } from "@/lib/external/timeline-view-types";
import { NO_ES_CONTENEDOR_WHERE } from "@/lib/projects/scope";
import { armarPlanGeneral, unirParaElCliente, type CronogramaDelCliente } from "./armar";
import type { PlanGeneral, ProyectoParaElegir } from "./tipos";

/** Un proyecto que puede estar en el plan de la cuenta: activo, de verdad y de ESTA cuenta (sin el escondido). */
export const PROYECTO_DEL_PLAN = (clientId: string) => ({
  clientId,
  status: "active",
  esPrueba: false,
  ...NO_ES_CONTENEDOR_WHERE,
});

const CON_LOOPS = { timeline: { phases: { some: { loopNumero: { not: null } } } } };

const SELECT_FASES = {
  select: {
    id: true,
    name: true,
    order: true,
    durationWeeks: true,
    startWeek: true,
    loopNumero: true,
    activityType: true,
    status: true,
    needsValidation: true,
    sessionCount: true,
    tasks: {
      select: {
        id: true,
        title: true,
        weekIndex: true,
        semanas: true,
        order: true,
        status: true,
        notes: true,
        needsValidation: true,
        source: true,
        statusSource: true,
        statusChangedByEmail: true,
        statusChangedAt: true,
        party: true,
        type: true,
        startDateOverride: true,
        dueDateOverride: true,
      },
    },
  },
} as const;

/** El plan guardado de la cuenta, con su lista y su cronograma. null = la cuenta no tiene plan todavía. */
export async function planDeLaCuenta(clientId: string) {
  return prisma.planGeneral.findUnique({
    where: { clientId },
    select: {
      id: true,
      proyectos: { select: { projectId: true } },
      cronograma: { select: { id: true, anchorStartDate: true, detailConfirmedAt: true, phases: SELECT_FASES } },
    },
  });
}

/** El filtro de los proyectos que entran: los de la lista del plan o, sin plan, los que tienen loops. */
function queEntran(clientId: string, plan: { proyectos: Array<{ projectId: string }> } | null) {
  return plan
    ? { ...PROYECTO_DEL_PLAN(clientId), id: { in: plan.proyectos.map((p) => p.projectId) } }
    : { ...PROYECTO_DEL_PLAN(clientId), ...CON_LOOPS };
}

export async function leerPlanGeneral(clientId: string): Promise<PlanGeneral> {
  const plan = await planDeLaCuenta(clientId);
  const proyectos = await prisma.project.findMany({
    where: queEntran(clientId, plan),
    orderBy: { name: "asc" },
    select: { id: true, name: true, timeline: { select: { anchorStartDate: true, detailConfirmedAt: true, phases: SELECT_FASES } } },
  });
  return armarPlanGeneral(proyectos, plan?.cronograma ?? null, !!plan);
}

/** Los proyectos de la cuenta que se pueden sumar al plan, y cuáles están. Sin plan, están los que tienen loops. */
export async function proyectosParaElegir(clientId: string): Promise<ProyectoParaElegir[]> {
  const [plan, proyectos] = await Promise.all([
    prisma.planGeneral.findUnique({ where: { clientId }, select: { proyectos: { select: { projectId: true } } } }),
    prisma.project.findMany({
      where: PROYECTO_DEL_PLAN(clientId),
      orderBy: { name: "asc" },
      select: { id: true, name: true, timeline: { select: { _count: { select: { phases: { where: { loopNumero: { not: null } } } } } } } },
    }),
  ]);
  const enLaLista = plan ? new Set(plan.proyectos.map((p) => p.projectId)) : null;
  return proyectos.map((p) => {
    const loops = p.timeline?._count.phases ?? 0;
    return { id: p.id, nombre: p.name, loops, incluido: enLaLista ? enLaLista.has(p.id) : loops > 0 };
  });
}

/** Lo que vería el cliente hoy: los cronogramas filtrados por el chokepoint del cronograma externo, unidos. */
export async function leerPlanParaElCliente(clientId: string): Promise<ExternalTimelineData> {
  const plan = await prisma.planGeneral.findUnique({
    where: { clientId },
    select: {
      id: true,
      proyectos: { select: { projectId: true } },
      cronograma: { select: { phases: { where: { loopNumero: { not: null } }, select: { id: true, loopNumero: true } } } },
    },
  });
  const proyectos = await prisma.project.findMany({
    where: queEntran(clientId, plan),
    select: { id: true, name: true, timeline: { select: { phases: { where: { loopNumero: { not: null } }, select: { id: true, loopNumero: true } } } } },
  });
  const numeros = (fases: Array<{ id: string; loopNumero: number | null }> | undefined) =>
    new Map((fases ?? []).flatMap((f) => (f.loopNumero != null ? [[f.id, f.loopNumero] as const] : [])));
  const cronogramas: CronogramaDelCliente[] = await Promise.all(
    proyectos.map(async (p) => ({ proyectoNombre: p.name, data: await readClientTimeline(p.id), loops: numeros(p.timeline?.phases) })),
  );
  if (plan?.cronograma) {
    cronogramas.push({ data: await readClientTimelineDelPlan(plan.id), loops: numeros(plan.cronograma.phases), delPlan: true });
  }
  return unirParaElCliente(cronogramas);
}

/** ¿La cuenta tiene plan general? Decide si el riel muestra «Plan general»: un plan guardado, o algún loop. */
export async function cuentaTienePlanGeneral(clientId: string): Promise<boolean> {
  const [plan, loops] = await Promise.all([
    prisma.planGeneral.count({ where: { clientId } }),
    prisma.timelinePhase.count({
      where: { loopNumero: { not: null }, timeline: { project: { clientId, status: "active", esPrueba: false } } },
    }),
  ]);
  return plan > 0 || loops > 0;
}
