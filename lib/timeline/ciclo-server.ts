/**
 * lib/timeline/ciclo-server.ts — lee las fases de los casos de uso para la ruta del servicio. Servidor, solo lectura.
 * Nexus ya no escribe el cronograma por ciclo (Elías, 31 oct): el cronograma se lleva como en cualquier proyecto.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { FaseDelCiclo } from "./ciclo";

const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** El cronograma del proyecto para el ciclo: el ancla y las fases pedidas, con sus tareas. */
export async function leerFasesDelCiclo(projectId: string, faseIds: readonly string[]): Promise<{ anchor: string | null; fases: FaseDelCiclo[] }> {
  const t = await prisma.projectTimeline.findUnique({ where: { projectId }, select: { id: true, anchorStartDate: true } });
  if (!t) return { anchor: null, fases: [] };
  const fases = faseIds.length
    ? await prisma.timelinePhase.findMany({
        where: { timelineId: t.id, id: { in: [...faseIds] } },
        select: {
          id: true, name: true, durationWeeks: true, startWeek: true, status: true,
          tasks: { orderBy: [{ weekIndex: "asc" }, { order: "asc" }], select: { id: true, title: true, weekIndex: true, status: true, party: true, needsValidation: true } },
        },
      })
    : [];
  return {
    anchor: dia(t.anchorStartDate),
    fases: fases.map((f) => ({
      ...f,
      status: String(f.status),
      tasks: f.tasks.map((x) => ({ ...x, status: String(x.status), party: x.party ? String(x.party) : null })),
    })),
  };
}
