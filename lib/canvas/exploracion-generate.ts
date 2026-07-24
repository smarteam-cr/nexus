/**
 * lib/canvas/exploracion-generate.ts
 *
 * Runner del canvas "Exploración" (guía INTERNA de descubrimiento del negocio).
 * Self-contained, calcado de `desarrollo-generate.ts`: asegura el canvas, arma el input
 * desde las fuentes, corre el agente tipado (`generateSectionsForTemplate`) y persiste
 * 1 bloque CARD por sección EN EL LUGAR (CONFIRMED, source AGENT).
 *
 * ORDEN DE PESO DE LAS FUENTES (el prompt lo repite; acá se materializa):
 *   1. El HANDOFF del proyecto — el ancla. De ahí sale qué se vendió, qué se prometió y
 *      qué quedó dicho a medias (que es de donde salen los supuestos sin verificar).
 *   2. Los handoffs y proyectos ANTERIORES del cliente (`loadPriorRelationshipContext`).
 *   3. Las ETIQUETAS del cliente/proyecto.
 *   4. Los demás CANVAS del proyecto (kickoff, cronograma) + los business cases.
 * (Los transcripts de sesiones y CS360 entran en la fase 2 — van por el chokepoint
 * `lib/sessions/project-sources.ts` y tienen otro presupuesto de tokens.)
 *
 * Lo dispara UN camino: el botón "Generar exploración" del HEADER del canvas (mapa
 * `CANVAS_PRIMARY_AGENT`, igual que el kickoff en su canvas), vía POST /analyze (que gatea
 * con artifact-gate y crea el AgentRun, y delega acá). NO hay auto-chain: el CSE decide
 * cuándo el kickoff ya pasó.
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { EXPLORACION_CANVAS } from "@/lib/canvas/canvas-defs";
import { createExploracionCanvas, reconcileExploracionCanvasSections } from "@/lib/canvas/default-canvases";
import { loadCanvasContext, loadTimelineContext, loadPriorRelationshipContext } from "@/lib/canvas/load-canvas-context";
import { generateSectionsForTemplate } from "@/lib/business-cases/canvas-agent";
import { EXPLORACION_TEMPLATE, EXPLORACION_HANDOFF_KEYS } from "@/components/landing/configs/exploracion.defs";
import { tagLabels } from "@/lib/tags/catalog";

/** Asegura el canvas "Exploración" del proyecto (lo crea si falta) + reconcilia sus
 *  secciones. Idempotente. Devuelve el canvasId. */
export async function ensureExploracionCanvas(projectId: string): Promise<string> {
  const existing = await prisma.projectCanvas.findFirst({
    where: { projectId, name: EXPLORACION_CANVAS.name },
    select: { id: true },
  });
  const canvasId = existing?.id ?? (await createExploracionCanvas(projectId));
  await reconcileExploracionCanvasSections(canvasId);
  return canvasId;
}

/** Serializa los business cases del cliente a una línea por caso. Es contexto de "qué le
 *  propusimos", no la fuente principal — por eso van los METADATOS, no el contenido. */
function businessCasesBlock(
  cases: Array<{ name: string; status: string; caseType: string | null; tags: string[] }>,
): string {
  if (cases.length === 0) return "";
  const lines = cases.map((c) => {
    const bits = [c.name, c.status];
    if (c.caseType) bits.push(c.caseType);
    const tl = tagLabels(c.tags);
    if (tl.length) bits.push(tl.join(", "));
    return `- ${bits.join(" · ")}`;
  });
  return `=== BUSINESS CASES DEL CLIENTE (qué le hemos propuesto) ===\n${lines.join("\n")}`;
}

/**
 * Genera (o regenera) la guía de exploración con IA. `agentRunId` se atribuye a los
 * bloques si se pasa (trazabilidad). `canvasId` opcional: si el caller ya lo resolvió,
 * se evita un segundo find-or-create+reconcile. Devuelve canvasId + secciones escritas.
 */
export async function runExploracionGeneration(opts: {
  projectId: string;
  agentRunId?: string | null;
  canvasId?: string;
}): Promise<{ canvasId: string; sectionCount: number }> {
  const { projectId } = opts;

  // Todas las fuentes son independientes entre sí → en paralelo, no en serie.
  const [canvasId, handoffCtx, kickoffCtx, timelineCtx, project] = await Promise.all([
    opts.canvasId ?? ensureExploracionCanvas(projectId),
    loadCanvasContext(projectId, "Handoff", { onlyConfirmed: false, includeKeys: EXPLORACION_HANDOFF_KEYS }),
    loadCanvasContext(projectId, "Kickoff", { onlyConfirmed: false }),
    loadTimelineContext(projectId),
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        name: true,
        tags: true,
        clientId: true,
        client: { select: { name: true, company: true, industry: true } },
      },
    }),
  ]);

  // Depende de `project.clientId` → va en una segunda tanda (también en paralelo).
  const [priorCtx, businessCases] = await Promise.all([
    project?.clientId ? loadPriorRelationshipContext(project.clientId, projectId) : Promise.resolve(""),
    project?.clientId
      ? prisma.businessCase.findMany({
          where: { clientId: project.clientId },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { name: true, status: true, caseType: true, tags: true },
        })
      : Promise.resolve([]),
  ]);

  const tagsLabel = tagLabels(project?.tags ?? []).join(", ");
  const companyName = project?.client?.name ?? project?.client?.company ?? "el cliente";

  const userMessage = [
    `Empresa: ${companyName}`,
    `Industria: ${project?.client?.industry ?? "No especificada"}`,
    `Proyecto: ${project?.name ?? "(sin nombre)"}`,
    tagsLabel ? `Alcance etiquetado (tags del proyecto): ${tagsLabel}` : "",
    "",
    "=== HANDOFF DEL PROYECTO — TU FUENTE ANCLA ===",
    handoffCtx ||
      "(Sin handoff curado. Decilo explícitamente en el hero y tratá TODO como no verificado: sin handoff, la exploración arranca de cero.)",
    priorCtx ? `\n${priorCtx}` : "",
    businessCasesBlock(businessCases),
    kickoffCtx ? `\n=== KICKOFF DEL PROYECTO (lo que ya se le dijo al cliente) ===\n${kickoffCtx}` : "",
    timelineCtx ? `\n${timelineCtx}` : "",
    "",
    "Escribí la guía de exploración siguiendo tus instrucciones: separá lo AFIRMADO de lo SUPUESTO, derivá las preguntas de los supuestos sin verificar, y declará en el hero qué calibración de tamaño de cliente usaste.",
  ]
    .filter((x) => x !== "")
    .join("\n");

  // Carry-forward: la generación sobreescribe los bloques EN EL LUGAR — sin la data
  // previa, `coerceToSchema` descartaría cualquier campo fuera de schema.
  const prevDataByKey: Record<string, unknown> = {};
  const prevSecs = await prisma.canvasSection.findMany({
    where: { canvasId },
    select: { id: true, key: true, blocks: { where: { blockType: "CARD" }, select: { data: true }, take: 1 } },
  });
  for (const s of prevSecs) {
    const d = s.blocks[0]?.data;
    if (d && typeof d === "object") prevDataByKey[s.key] = d;
  }

  const gen = await generateSectionsForTemplate(
    EXPLORACION_TEMPLATE,
    userMessage,
    undefined,
    undefined,
    prevDataByKey,
  );

  // Persistir 1 CARD/sección EN EL LUGAR. `gen.sections` solo trae las que el agente
  // genera (hero + 5 de contenido); `cierre` (agentGenerated:false, curada) NO viene →
  // su bloque sembrado queda intacto.
  const sectionMap = new Map(prevSecs.map((s) => [s.key, s.id]));
  let sectionCount = 0;
  for (const s of gen.sections) {
    const sectionId = sectionMap.get(s.key);
    if (!sectionId) continue;
    await prisma.$transaction([
      prisma.canvasBlock.deleteMany({ where: { sectionId } }),
      prisma.canvasBlock.create({
        data: {
          sectionId,
          blockType: "CARD",
          content: null,
          data: (s.data ?? {}) as Prisma.InputJsonValue,
          order: 0,
          source: "AGENT",
          status: "CONFIRMED",
          ...(opts.agentRunId ? { agentRunId: opts.agentRunId } : {}),
        },
      }),
    ]);
    sectionCount++;
  }
  return { canvasId, sectionCount };
}
