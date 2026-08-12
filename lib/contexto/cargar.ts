/**
 * lib/contexto/cargar.ts — EL CARGADOR SERVER-SIDE DEL CONTEXTO NOMBRADO.
 * Server-only (Prisma). La parte pura (fuentes, reglas, template) vive en
 * `./detalle-cronograma.ts`; los tipos en `./tipos.ts`.
 *
 * Una función por pieza registrada en PIEZAS_CON_CONTEXTO_NOMBRADO. Cada una compone los
 * loaders EXISTENTES (que ya llevan la procedencia adentro y pasan por el embudo del
 * handoff) y devuelve un ContextoDeProyecto: por primera vez, «lo que ve el agente» es un
 * valor con nombre que se puede loguear, testear y auditar — no un tramo de template.
 */
import { prisma } from "@/lib/db/prisma";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { loadHandoffContext, loadTimelineContext } from "@/lib/canvas/load-canvas-context";
import { loadDesarrolloContext } from "@/lib/canvas/desarrollo-context";
import { bloqueDeInstruccionesDeDoc, docBriefFrom } from "@/lib/business-cases/section-briefs";
import type { ProjectPipelineKey } from "@/lib/projects/kind";
import type { ContextoDeProyecto } from "./tipos";
import { fuentesDelDetalle } from "./detalle-cronograma";

/**
 * El contexto del Detalle de Cronograma (pieza "timeline"):
 *   · cronograma-actual      — las fases existentes CON ids (el agente referencia, no crea)
 *   · handoff-curado         — SOLO bloques confirmados por el CSE (onlyConfirmed)
 *   · requerimiento-tecnico  — el canvas Desarrollo si existe ("" si no)
 *   · instrucciones          — la entry `__doc` del canvas del cronograma (X1); "" sin brief
 *
 * Sin fechas en el contexto a propósito: el agente no las calcula.
 */
export async function cargarContextoDelDetalle(
  projectId: string,
  pipelineKey: ProjectPipelineKey | null = null,
): Promise<ContextoDeProyecto> {
  const [handoffCtx, timelineCtx, desarrolloCtx, canvasCronograma] = await Promise.all([
    loadHandoffContext(projectId, { onlyConfirmed: true }),
    loadTimelineContext(projectId, { includeIds: true }),
    loadDesarrolloContext(projectId),
    prisma.projectCanvas.findFirst({
      where: { projectId, ...canvasOf("timeline") },
      select: { sections: true },
    }),
  ]);
  return {
    projectId,
    pipelineKey,
    fuentes: fuentesDelDetalle({ timelineCtx, handoffCtx, desarrolloCtx }),
    instrucciones: bloqueDeInstruccionesDeDoc(
      canvasCronograma ? docBriefFrom(canvasCronograma.sections) : null,
    ),
  };
}
