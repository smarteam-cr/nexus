/**
 * lib/entregables/generar-server.ts — UNA función genera cualquier entregable con su plantilla y las instrucciones de
 * quien pide (fase 5 de docs/nexus-sistema-de-trabajo-plan.md, 2026-10-17). SERVER-ONLY.
 *
 * La usan las dos puertas:
 *   · el botón «Generar» de cada documento, por /analyze (app/api/clients/[id]/analyze/route.ts), que conserva su
 *     corrida, su medidor y su artifact-gate;
 *   · el chat de Nexus, por `lanzarEntregable` (./lanzar-server.ts), con la operación «documento.generar».
 *
 * `generarEntregable` hace el TRABAJO (leer, generar, escribir) y anota en el documento la plantilla que se usó. La
 * corrida (`AgentRun`), el medidor (`conContextoDeIA`) y el permiso los pone quien la llama, como hasta hoy en /analyze.
 *
 * Los runners son los de siempre (lib/canvas/*-generate.ts); el del kickoff salió de /analyze el mismo día
 * (lib/canvas/kickoff-generate.ts). La exploración y la ejecución NO pasan por acá: son herramientas del proyecto, sin
 * plantilla, y siguen con su atajo en /analyze.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { canvasOf, canvasOfNested } from "@/lib/pieces/canvas-query";
import { piezaAplica, pieceReadiness } from "@/lib/flow/piece-readiness";
import { runKickoffGeneration } from "@/lib/canvas/kickoff-generate";
import { runDiagnosticoGeneration } from "@/lib/canvas/diagnostico-generate";
import { runPlanificacionGeneration } from "@/lib/canvas/planificacion-generate";
import { runDesarrolloGeneration } from "@/lib/canvas/desarrollo-generate";
import { runEntregaGeneration } from "@/lib/canvas/entrega-generate";
import { conPlantillaAnotada, entregableDe, nombreDelEntregable, plantillaDe, plantillaDelDocumento, type PlantillaDeEntregable } from "./registro";
import { templateDeLaPlantilla } from "./plantillas";

export interface PedidoDeEntregable {
  projectId: string;
  /** El slug del entregable (lib/entregables/registro.ts). */
  slug: string;
  /** La plantilla; sin ella, la de siempre. Un id que no es de ese entregable se rechaza. */
  plantillaId?: string | null;
  /** Lo que pidió quien genera, para esta corrida. */
  instrucciones?: string | null;
  /** La corrida a la que se atribuyen los bloques (la crea quien llama). */
  agentRunId: string | null;
  /** Quién la pidió, para la plantilla anotada. */
  porEmail?: string | null;
  /** La fase visible de la corrida («Escribiendo el diagnóstico…»). */
  alFase?: (fase: string) => void;
}

export interface EntregableGenerado {
  canvasId: string;
  sectionCount: number;
  plantilla: PlantillaDeEntregable;
  /**
   * La salida que el runner YA dejó en la corrida (hoy, el kickoff: su `output` son las secciones, que lee el visor del
   * historial). Con ella, quien cierra la corrida no la pisa con el conteo de secciones.
   */
  salidaEnLaCorrida?: unknown;
}

export class ErrorDelEntregable extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** La fase que se ve mientras corre (la misma que decía /analyze para cada documento). */
const FASE: Record<string, string> = {
  kickoff: "Escribiendo el kickoff…",
  diagnosis: "Escribiendo el diagnóstico…",
  planning: "Armando el plan…",
  "tech-requirements": "Escribiendo el requerimiento técnico…",
  delivery: "Armando el cierre…",
};

/** La plantilla pedida, o el motivo por el que no existe. */
export function resolverPlantilla(slug: string, plantillaId?: string | null): PlantillaDeEntregable {
  const e = entregableDe(slug);
  if (!e) throw new ErrorDelEntregable(400, `«${slug}» no es un entregable del proyecto.`);
  const p = plantillaDe(slug, plantillaId);
  if (!p) throw new ErrorDelEntregable(400, `${nombreDelEntregable(slug)} no tiene la plantilla «${plantillaId}».`);
  return p;
}

/**
 * La plantilla que el documento ya tiene anotada (`__plantilla`), o null. Sin pedir una, regenerar usa ESTA y no «la de
 * siempre» (2026-10-23): un diagnóstico esencial regenerado desde el botón de arriba no puede volverse el completo.
 */
async function plantillaGuardada(projectId: string, slug: string): Promise<string | null> {
  const c = await prisma.projectCanvas.findFirst({ where: { projectId, ...canvasOf(slug) }, select: { sections: true } });
  const g = c ? plantillaDelDocumento(slug, c.sections) : null;
  return g?.guardada ? g.plantilla.id : null;
}

export async function generarEntregable(pedido: PedidoDeEntregable): Promise<EntregableGenerado> {
  const plantillaId = pedido.plantillaId ?? (await plantillaGuardada(pedido.projectId, pedido.slug).catch(() => null));
  const plantilla = resolverPlantilla(pedido.slug, plantillaId);
  const template = templateDeLaPlantilla(plantilla.id);
  const base = { projectId: pedido.projectId, agentRunId: pedido.agentRunId, plantilla: template, instrucciones: pedido.instrucciones ?? null };
  const fase = FASE[pedido.slug];
  if (fase) pedido.alFase?.(fase);

  let r: { canvasId: string; sectionCount: number; salida?: unknown };
  switch (pedido.slug) {
    case "kickoff":
      r = await runKickoffGeneration(base);
      break;
    case "diagnosis":
      r = await runDiagnosticoGeneration(base);
      break;
    case "planning":
      r = await runPlanificacionGeneration(base);
      break;
    case "tech-requirements":
      r = await runDesarrolloGeneration(base);
      break;
    case "delivery":
      r = await runEntregaGeneration(base);
      break;
    default:
      // El registro y este switch se mueven juntos: lib/entregables/registro.test.ts congela el set.
      throw new ErrorDelEntregable(400, `«${pedido.slug}» no se genera desde acá.`);
  }

  // La plantilla que se usó queda en el documento. Best-effort: el documento ya está escrito.
  await anotarPlantilla(r.canvasId, plantilla, pedido.porEmail ?? null).catch((e) =>
    console.warn("[entregables] la plantilla no quedó anotada:", e instanceof Error ? e.message : e),
  );
  return { canvasId: r.canvasId, sectionCount: r.sectionCount, plantilla, ...(r.salida !== undefined ? { salidaEnLaCorrida: r.salida } : {}) };
}

/** Escribe la entry `__plantilla` del Json de secciones del documento, tocando solo esa entry. */
async function anotarPlantilla(canvasId: string, plantilla: PlantillaDeEntregable, por: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // FOR UPDATE: el Json lo escriben también los briefs y el «Ahora no» de los cuestionarios.
    await tx.$queryRaw`SELECT id FROM "ProjectCanvas" WHERE id = ${canvasId} FOR UPDATE`;
    const c = await tx.projectCanvas.findUnique({ where: { id: canvasId }, select: { sections: true } });
    if (!c) return;
    const sections = conPlantillaAnotada(c.sections, plantilla, por, new Date().toISOString());
    await tx.projectCanvas.update({ where: { id: canvasId }, data: { sections: sections as object[] } });
  });
}

/**
 * Por qué no se puede generar este entregable en este proyecto, o null. Las mismas puertas que /analyze antes de correr
 * (que las sigue teniendo en su lugar): el kickoff sin handoff generado, y una pieza que no le corresponde al proyecto
 * por sus etiquetas o su tipo. El chat las mira AL PROPONER, así no ofrece algo que va a fallar.
 */
export async function porQueNoSePuedeGenerar(projectId: string, slug: string): Promise<string | null> {
  if (!entregableDe(slug)) return `«${slug}» no es un entregable del proyecto.`;
  if (slug === "kickoff") {
    const handoff = await prisma.canvasBlock.count({ where: { section: { canvas: canvasOfNested("handoff", { projectId }) } } });
    if (handoff === 0) return "Este proyecto no tiene handoff generado: el kickoff sale del handoff.";
    const canvas = await prisma.projectCanvas.findFirst({ where: { projectId, ...canvasOf("kickoff") }, select: { id: true } });
    if (!canvas) return "Este proyecto no tiene el kickoff: actívalo en el riel de la ficha.";
  }
  const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { tags: true, hubspotPipelineId: true } });
  const hechos = { tags: proj?.tags ?? [], hubspotPipelineId: proj?.hubspotPipelineId ?? null };
  if (!piezaAplica(slug, hechos)) {
    return pieceReadiness(slug, { ...hechos, piezasConContenido: [] }).reason ?? `${nombreDelEntregable(slug)} no le corresponde a este proyecto.`;
  }
  return null;
}
