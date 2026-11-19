/**
 * lib/plan-general/leer.ts — lee de la base el plan general de una cuenta. Server-only.
 *
 * Entran los proyectos ACTIVOS de la cuenta que no son de prueba, con su cronograma. No lee reuniones: el
 * chokepoint de sesiones (invariante 1) no aplica, y la cuenta sale del `clientId` de cada proyecto, así que un
 * proyecto de otra cuenta no puede colarse.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { armarPlanGeneral } from "./armar";
import type { PlanGeneral } from "./tipos";

export async function leerPlanGeneral(clientId: string, opciones: { paraElCliente?: boolean } = {}): Promise<PlanGeneral> {
  const proyectos = await prisma.project.findMany({
    where: { clientId, status: "active", esPrueba: false, timeline: { isNot: null } },
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
              tasks: {
                select: {
                  id: true,
                  title: true,
                  weekIndex: true,
                  order: true,
                  semanas: true,
                  tipoDeTrabajo: true,
                  status: true,
                  notes: true,
                  needsValidation: true,
                },
              },
            },
          },
        },
      },
    },
  });
  return armarPlanGeneral(proyectos, opciones);
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
