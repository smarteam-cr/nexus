/**
 * lib/plan-general/leer.ts — lee de la base el plan general de una cuenta. Server-only.
 *
 * Entran los proyectos ACTIVOS de la cuenta que no son de prueba y tienen al menos una fase-loop. No lee reuniones: el
 * chokepoint de sesiones (invariante 1) no aplica, y la cuenta sale del `clientId` de cada proyecto, así que un
 * proyecto de otra cuenta no puede colarse.
 *
 * Lo que ve el cliente NO se lee acá campo por campo: pasa por `readClientTimeline` (lib/external/timeline-view.ts), el
 * único filtro de lo que cruza del cronograma, proyecto por proyecto, y después se une (`unirParaElCliente`).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { readClientTimeline } from "@/lib/external/timeline-view";
import type { ExternalTimelineData } from "@/lib/external/timeline-view-types";
import { armarPlanGeneral, unirParaElCliente } from "./armar";
import type { PlanGeneral } from "./tipos";

const DE_LA_CUENTA = (clientId: string) => ({
  clientId,
  status: "active",
  esPrueba: false,
  timeline: { phases: { some: { loopNumero: { not: null } } } },
});

export async function leerPlanGeneral(clientId: string): Promise<PlanGeneral> {
  const proyectos = await prisma.project.findMany({
    where: DE_LA_CUENTA(clientId),
    select: {
      id: true,
      name: true,
      timeline: {
        select: {
          anchorStartDate: true,
          detailConfirmedAt: true,
          phases: {
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
          },
        },
      },
    },
  });
  return armarPlanGeneral(proyectos);
}

/** Lo que vería el cliente hoy: los cronogramas filtrados por el chokepoint del cronograma externo, unidos. */
export async function leerPlanParaElCliente(clientId: string): Promise<ExternalTimelineData> {
  const proyectos = await prisma.project.findMany({
    where: DE_LA_CUENTA(clientId),
    select: { id: true, name: true, timeline: { select: { phases: { where: { loopNumero: { not: null } }, select: { id: true, loopNumero: true } } } } },
  });
  const cronogramas = await Promise.all(
    proyectos.map(async (p) => ({
      proyectoNombre: p.name,
      data: await readClientTimeline(p.id),
      loops: new Map((p.timeline?.phases ?? []).map((f) => [f.id, f.loopNumero!])),
    })),
  );
  return unirParaElCliente(cronogramas);
}

/** ¿La cuenta tiene al menos un loop? Decide si el riel muestra «Plan general». */
export async function cuentaTienePlanGeneral(clientId: string): Promise<boolean> {
  const n = await prisma.timelinePhase.count({
    where: {
      loopNumero: { not: null },
      timeline: { project: { clientId, status: "active", esPrueba: false } },
    },
  });
  return n > 0;
}
