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
 * Sincroniza los flowcharts de un agente a la sección "Procesos" del canvas Información del
 * cliente. REEMPLAZA los procesos previos de ESE MISMO agente (acotado por agentRun.agentId)
 * y crea los nuevos, en una transacción — mismo patrón que el path BLOCK_FORMAT del handoff.
 * Los bloques nacen CONFIRMED (sin paso de "Aceptar todos"; borrar = quitar). Preserva los
 * procesos de OTROS agentes (p.ej. diagnóstico-marketing) y lo editado a mano (MODIFIED/HUMAN).
 *
 * `summaryCards` (opcional): cards de texto del agente (p.ej. "Procesos Clave Identificados")
 * que van como bloques TEXT CONFIRMED ANTES de los diagramas, por la MISMA vía — el deleteWhere
 * no filtra blockType, así que la card sigue el ciclo de vida de los flowcharts (se reemplaza
 * en cada regen, sin duplicados ni paso de aceptar). Si el CSE EDITÓ la card (TEXT MODIFIED),
 * también se reemplaza cuando llega card nueva (es el inventario del agente sobre los diagramas
 * actuales); los FLOWCHART editados a mano sí se preservan.
 *
 * Devuelve cuántos bloques creó. Si la corrida NO trae diagramas (solo cards / truncación), NO
 * toca lo previo (no borra, tampoco actualiza la card) — evita perder procesos buenos.
 */
export async function syncFlowchartsToProcesos(
  clientId: string,
  flowcharts: FlowchartLike[],
  opts: { agentId: string; agentRunId: string; summaryCards?: { title: string; content: string }[] },
): Promise<number> {
  const valid = (flowcharts ?? []).filter(
    (fc) => fc && Array.isArray(fc.nodes) && fc.nodes.length > 0,
  );

  // CRÍTICO: si esta corrida NO trajo diagramas con nodos (el agente devolvió solo cards, o los
  // flowcharts se truncaron por max_tokens y la reparación los descartó), NO borramos nada — si
  // no, un re-run "exitoso pero sin diagramas" borraría los procesos buenos previos.
  if (valid.length === 0) return 0;

  const sectionId = await ensureProcesosSection(clientId);

  // Reemplazo acotado a los procesos de ESTE agente. Incluye los bloques AGENTE sin agentRunId
  // (legacy: la migración inicial y la versión vieja del sync no lo seteaban) para que no queden
  // duplicados huérfanos al regenerar. Los manuales (MODIFIED/HUMAN) y los de OTRO agente (con su
  // propio agentRunId) NO matchean → se conservan. (Transición: un primer regen puede barrer
  // también procesos legacy de otro agente CAF; se regeneran y de ahí en más quedan atribuidos.)
  const mineOrLegacy = {
    source: "AGENT" as const,
    OR: [{ agentRun: { agentId: opts.agentId } }, { agentRunId: null }],
  };
  const deleteWhere = { sectionId, ...mineOrLegacy };

  const summaryCards = (opts.summaryCards ?? []).filter((c) => c.title?.trim());

  // La card resumen editada a mano (TEXT MODIFIED de ESTE agente) se barre SOLO cuando esta
  // corrida trae card nueva: la card es el inventario del agente sobre los diagramas ACTUALES;
  // conservar la editada junto a la nueva duplicaría inventarios contradictorios (el stale
  // primero). Los FLOWCHART MODIFIED (diagramas afinados a mano) SÍ se preservan.
  const modifiedCardWhere = summaryCards.length > 0
    ? { sectionId, blockType: "TEXT" as const, source: "MODIFIED" as const, agentRun: { agentId: opts.agentId } }
    : null;

  // Orden: DESPUÉS de los bloques que sobreviven. max(order)+1 — un count no alcanza porque los
  // preservados conservan su order original y los nuevos podrían empatar/intercalarse con ellos.
  const survivors = await prisma.canvasBlock.aggregate({
    _max: { order: true },
    where: {
      sectionId,
      AND: [{ NOT: mineOrLegacy }, ...(modifiedCardWhere ? [{ NOT: modifiedCardWhere }] : [])],
    },
  });
  const base = (survivors._max.order ?? -1) + 1;

  // Cards de resumen (TEXT) primero — CanvasBlock no tiene campo title: va embebido en el
  // markdown del content (TextBlockView lo renderiza como heading).
  const cardBlocks = summaryCards.map((c, j) => ({
    sectionId,
    blockType: "TEXT" as const,
    content: `### ${c.title.trim()}\n\n${(c.content ?? "").trim()}`,
    order: base + j,
    source: "AGENT" as const,
    status: "CONFIRMED" as const,
    agentRunId: opts.agentRunId,
  }));

  const blocks = valid.map((fc, i) => ({
    sectionId,
    blockType: "FLOWCHART" as const,
    content: fc.title?.trim() || "Diagrama de proceso",
    data: {
      nodes: fc.nodes,
      edges: fc.edges,
      ...(fc.description?.trim() ? { description: fc.description.trim() } : {}),
    } as object,
    order: base + cardBlocks.length + i,
    source: "AGENT" as const,
    status: "CONFIRMED" as const,
    agentRunId: opts.agentRunId,
  }));

  await prisma.$transaction([
    prisma.canvasBlock.deleteMany({ where: deleteWhere }),
    ...(modifiedCardWhere ? [prisma.canvasBlock.deleteMany({ where: modifiedCardWhere })] : []),
    prisma.canvasBlock.createMany({ data: [...cardBlocks, ...blocks] }),
  ]);
  return cardBlocks.length + blocks.length;
}
