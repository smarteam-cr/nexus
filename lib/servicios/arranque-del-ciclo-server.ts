/**
 * lib/servicios/arranque-del-ciclo-server.ts — junta lo que necesita `lib/servicios/arranque-del-ciclo.ts` de UN proyecto
 * recurrente. SERVIDOR, solo lectura. Si algo falla, cuenta como «no hay» y nunca rompe el riel.
 *
 * De la exploración lee SOLO las fechas de lo que leyó (`fechasDeLasLecturasDelProyecto`, su puerta en
 * lib/exploraciones/del-proyecto.ts): nunca lo que dice.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { PLANTILLA_DEL_KICKOFF_RECURRENTE, plantillaDelDocumento } from "@/lib/entregables/registro";
import { fechasDeLasLecturasDelProyecto } from "@/lib/exploraciones/del-proyecto";
import { kickoffAnteriorAlServicio, lecturasDelCiclo, type ArranqueDelCiclo } from "./arranque-del-ciclo";

/** La plantilla anotada en el kickoff (`__plantilla`); null si nunca se anotó. */
function plantillaGuardada(sections: unknown): string | null {
  const g = plantillaDelDocumento("kickoff", sections);
  return g?.guardada ? g.plantilla.id : null;
}

/**
 * `desde`: cuándo empieza a contar la exploración de ESTE ciclo (el cierre del ciclo anterior). null = el primer ciclo.
 */
export async function arranqueDelCiclo(projectId: string, desde: Date | null): Promise<ArranqueDelCiclo> {
  const [lecturas, kickoff] = await Promise.all([
    fechasDeLasLecturasDelProyecto(projectId).catch(() => []),
    prisma.projectCanvas
      .findFirst({
        where: { projectId, ...canvasOf("kickoff") },
        select: { sections: true, _count: { select: { canvasSections: { where: { blocks: { some: { source: { in: ["AGENT", "MODIFIED"] } } } } } } } },
      })
      .catch(() => null),
  ]);
  return {
    lecturasDeExploracion: lecturasDelCiclo(Object.fromEntries(lecturas.map((l, i) => [String(i), l])), desde),
    kickoffAnteriorAlServicio: kickoff
      ? kickoffAnteriorAlServicio({
          conContenido: kickoff._count.canvasSections > 0,
          plantillaId: plantillaGuardada(kickoff.sections),
          plantillaDelServicio: PLANTILLA_DEL_KICKOFF_RECURRENTE,
        })
      : false,
  };
}
