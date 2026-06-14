/**
 * lib/canvas/sync-procesos-blocks.ts
 *
 * Puente de los diagramas de proceso (flowcharts) que produce un agente
 * CARDS_AND_FLOWCHARTS hacia la sección "Procesos" del canvas "Información del
 * cliente" (proyecto __strategy__), que es DONDE los lee la pestaña Procesos
 * (SectionBlockList → CanvasBlock). Sin esto, los flowcharts solo viven como
 * ClientContextCard legacy del proyecto de servicio y NO aparecen en esa pestaña.
 *
 * Replica `ensureProcesosSection` de scripts/migrate-procesos-to-blocks.ts (que
 * migró lo EXISTENTE una sola vez); esta es la vía para la salida FUTURA del agente.
 */
import { prisma } from "@/lib/db/prisma";

const SENTINEL = "__strategy__";
const CANVAS_NAME = "Información del cliente";
const INFO_SECTIONS = [
  { key: "stakeholders", label: "Stakeholders" },
  { key: "retos_estrategicos", label: "Retos Estratégicos" },
  { key: "oportunidades", label: "Oportunidades" },
  { key: "procesos", label: "Procesos" },
];

/**
 * Devuelve el id de la sección "procesos" del canvas Información del cliente,
 * creando project/canvas/secciones si faltan. Idempotente.
 */
export async function ensureProcesosSection(clientId: string): Promise<string> {
  let project = await prisma.project.findFirst({
    where: { clientId, serviceType: SENTINEL },
    select: { id: true },
  });
  if (!project) {
    project = await prisma.project.create({
      data: { clientId, name: CANVAS_NAME, serviceType: SENTINEL, projectType: "USE_CASE", status: "active" },
      select: { id: true },
    });
  }
  let canvas = await prisma.projectCanvas.findFirst({
    where: { projectId: project.id, name: CANVAS_NAME },
    select: { id: true },
  });
  if (!canvas) {
    canvas = await prisma.projectCanvas.create({
      data: { projectId: project.id, name: CANVAS_NAME, isDefault: false },
      select: { id: true },
    });
  }
  await prisma.canvasSection.createMany({
    data: INFO_SECTIONS.map((s, i) => ({ canvasId: canvas!.id, key: s.key, label: s.label, order: i })),
    skipDuplicates: true,
  });
  const procesos = await prisma.canvasSection.findUnique({
    where: { canvasId_key: { canvasId: canvas.id, key: "procesos" } },
    select: { id: true },
  });
  return procesos!.id;
}

export type FlowchartLike = { title?: string; description?: string; nodes: unknown[]; edges: unknown[] };

/**
 * Crea un CanvasBlock tipo FLOWCHART (status DRAFT, source AGENT) en la sección
 * "Procesos" del canvas Información del cliente por cada flowchart con nodos.
 * Devuelve cuántos bloques creó. No-op si no hay flowcharts con nodos.
 */
export async function syncFlowchartsToProcesos(
  clientId: string,
  flowcharts: FlowchartLike[],
): Promise<number> {
  const valid = (flowcharts ?? []).filter(
    (fc) => fc && Array.isArray(fc.nodes) && fc.nodes.length > 0,
  );
  if (valid.length === 0) return 0;

  const sectionId = await ensureProcesosSection(clientId);
  let order = await prisma.canvasBlock.count({ where: { sectionId } });
  let created = 0;
  for (const fc of valid) {
    await prisma.canvasBlock.create({
      data: {
        sectionId,
        blockType: "FLOWCHART",
        content: fc.title?.trim() || "Diagrama de proceso",
        data: {
          nodes: fc.nodes,
          edges: fc.edges,
          ...(fc.description?.trim() ? { description: fc.description.trim() } : {}),
        } as object,
        order: order++,
        source: "AGENT",
        status: "DRAFT",
      },
    });
    created++;
  }
  return created;
}
