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
import { resolvePipeline, type ProjectPipelineKey } from "@/lib/projects/kind";
import type { ContextoDeProyecto } from "./tipos";
import { fuentesDelDetalle } from "./detalle-cronograma";
import { fuentesDelAssist } from "./asistente-cronograma";
import { bloqueDeOperativa } from "@/lib/cs/hubspot-ops-block";

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

/**
 * El contexto del MODIFICADOR de cronograma (pieza "assist"): el agente que atiende
 * «atrasá Setup una semana» / «agregá tareas de migración en configuración».
 *
 *   · cronograma-vivo        — el cronograma CON ids y CON el estado de cada tarea
 *   · handoff-curado         — SOLO bloques confirmados por el CSE
 *   · requerimiento-tecnico  — el canvas Desarrollo si existe ("" si no)
 *   · operativa-hubspot      — estado / prioridad / motivo de bloqueo, si el equipo los cargó
 *   · instrucciones          — la misma entry `__doc` del canvas del cronograma que lee el detalle
 *
 * ⚠ EL CRONOGRAMA LO PASA EL LLAMADOR, no se carga acá. La ruta ya lo trae con su select
 * propio —necesita `status` y `source` para el rescate de progreso del final— y volver a
 * leerlo abriría la puerta a que las dos lecturas se separen: la que el modelo ve y la que el
 * servidor protege tienen que ser LA MISMA.
 *
 * ⚠ Las instrucciones salen del canvas "timeline", no de uno propio: el brief `__doc` es
 * «instrucciones para esta PIEZA», y el modificador edita la misma pieza que el detalle.
 * Si tuvieran cajas separadas, el CSE escribiría una regla y solo la mitad de los agentes
 * la leería.
 */
export async function cargarContextoDelAssist(
  projectId: string,
  cronogramaCtx: string,
): Promise<ContextoDeProyecto> {
  const [handoffCtx, desarrolloCtx, canvasCronograma, proyecto] = await Promise.all([
    loadHandoffContext(projectId, { onlyConfirmed: true }),
    loadDesarrolloContext(projectId),
    prisma.projectCanvas.findFirst({
      where: { projectId, ...canvasOf("timeline") },
      select: { sections: true },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        // El tipo sale del pipeline, nunca se guarda (regla del multipipeline).
        hubspotPipelineId: true,
        hubspotStatus: true,
        hubspotPriority: true,
        hubspotBlockReason: true,
        hubspotBlockDetail: true,
        hubspotAdoptionState: true,
      },
    }),
  ]);
  return {
    projectId,
    pipelineKey: resolvePipeline(proyecto?.hubspotPipelineId ?? null)?.key ?? null,
    fuentes: fuentesDelAssist({
      cronogramaCtx,
      handoffCtx,
      desarrolloCtx,
      operativaCtx: proyecto ? bloqueDeOperativa(proyecto, { incluirRotulo: false }) : "",
    }),
    instrucciones: bloqueDeInstruccionesDeDoc(
      canvasCronograma ? docBriefFrom(canvasCronograma.sections) : null,
    ),
  };
}
