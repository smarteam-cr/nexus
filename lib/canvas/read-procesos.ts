/**
 * lib/canvas/read-procesos.ts
 *
 * Lectura de los diagramas de proceso (FLOWCHART) de un CLIENTE — viven en la sección
 * "procesos" del canvas "Información del cliente" (proyecto __strategy__), donde los
 * deja `sync-procesos-blocks.ts`. Lo consume el kickoff (interno: todos; externo: solo
 * CONFIRMED) para renderizarlos como sección "Procesos".
 */
import { prisma } from "@/lib/db/prisma";

const SENTINEL = "__strategy__";
const CANVAS_NAME = "Información del cliente";

export interface ProcesoFlowchart {
  id: string;
  title: string | null;
  /** { nodes, edges, description? } — shape de FlowchartViewer. */
  data: unknown;
  /** DRAFT | CONFIRMED. Lo usa el editor del kickoff para el botón "Confirmar para el cliente". */
  status?: string;
}

export async function readClientProcesos(
  clientId: string,
  opts: { onlyConfirmed?: boolean } = {},
): Promise<ProcesoFlowchart[]> {
  const strategy = await prisma.project.findFirst({
    where: { clientId, serviceType: SENTINEL },
    select: { id: true },
  });
  if (!strategy) return [];

  const blocks = await prisma.canvasBlock.findMany({
    where: {
      blockType: "FLOWCHART",
      ...(opts.onlyConfirmed ? { status: "CONFIRMED" } : {}),
      section: { key: "procesos", canvas: { projectId: strategy.id, name: CANVAS_NAME } },
    },
    orderBy: { order: "asc" },
    select: { id: true, content: true, data: true, status: true },
  });

  // Solo flowcharts con nodos (descarta vacíos).
  return blocks
    .filter((b) => {
      const d = b.data as { nodes?: unknown[] } | null;
      return Array.isArray(d?.nodes) && (d!.nodes as unknown[]).length > 0;
    })
    .map((b) => ({ id: b.id, title: b.content, data: b.data, status: b.status }));
}
