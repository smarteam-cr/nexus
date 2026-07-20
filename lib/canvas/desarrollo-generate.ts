/**
 * lib/canvas/desarrollo-generate.ts
 *
 * Runner del canvas "Desarrollo" (requerimiento técnico). Self-contained: asegura el
 * canvas del proyecto, arma el input desde la sección `desarrollo` del handoff + los
 * tags, corre el agente tipado (`generateSectionsForTemplate`) y persiste 1 bloque
 * CARD por sección EN EL LUGAR (CONFIRMED, source AGENT) — igual que el kickoff.
 *
 * Lo llaman DOS caminos con la MISMA lógica:
 *   - el botón manual "Generar/Regenerar" (vía POST /analyze, que delega acá);
 *   - el AUTO-CHAIN del handoff (fire-and-forget, cuando detecta trabajo técnico).
 *
 * No depende de la tabla Agent (toma el template directo) → el auto-chain lo invoca
 * sin lookup de agente. El botón manual sí pasa por /analyze (gating + AgentRun).
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { DESARROLLO_CANVAS } from "@/lib/canvas/canvas-defs";
import { createDesarrolloCanvas, reconcileDesarrolloCanvasSections } from "@/lib/canvas/default-canvases";
import { loadCanvasContext } from "@/lib/canvas/load-canvas-context";
import { generateSectionsForTemplate } from "@/lib/business-cases/canvas-agent";
import { specToDiagram, relacionToDiagram } from "@/lib/flowchart/spec-to-diagram";
import { DESARROLLO_TEMPLATE, DESARROLLO_HANDOFF_KEYS } from "@/components/landing/configs/desarrollo.defs";
import { tagLabels } from "@/lib/tags/catalog";

/** Asegura el canvas "Desarrollo" del proyecto (lo crea si falta) + reconcilia sus
 *  secciones. Idempotente. Devuelve el canvasId. */
export async function ensureDesarrolloCanvas(projectId: string): Promise<string> {
  const existing = await prisma.projectCanvas.findFirst({
    where: { projectId, name: DESARROLLO_CANVAS.name },
    select: { id: true },
  });
  const canvasId = existing?.id ?? (await createDesarrolloCanvas(projectId));
  await reconcileDesarrolloCanvasSections(canvasId);
  return canvasId;
}

/**
 * Genera (o regenera) el requerimiento técnico del canvas Desarrollo con IA.
 * `agentRunId` se atribuye a los bloques si se pasa (trazabilidad). `canvasId`
 * es opcional: si el caller ya lo resolvió (ej. el auto-chain del handoff, que
 * necesita el canvas creado SÍNCRONAMENTE antes de disparar esto fire-and-forget),
 * lo pasa acá para evitar un segundo find-or-create+reconcile redundante — sin
 * `canvasId`, esta función lo asegura ella misma (camino del botón manual).
 * Devuelve el canvasId y cuántas secciones se escribieron.
 */
export async function runDesarrolloGeneration(opts: {
  projectId: string;
  agentRunId?: string | null;
  canvasId?: string;
}): Promise<{ canvasId: string; sectionCount: number }> {
  const { projectId } = opts;

  // Input: sección `desarrollo` del handoff (+ alcance/dolor/expectativas/stakeholders)
  // + los tags del proyecto (los sistemas/alcance técnico). Independientes entre sí
  // (y del canvas, si ya viene resuelto) → en paralelo en vez de 3 round-trips seguidos.
  const [canvasId, handoffCtx, project] = await Promise.all([
    opts.canvasId ?? ensureDesarrolloCanvas(projectId),
    loadCanvasContext(projectId, "Handoff", {
      onlyConfirmed: false,
      includeKeys: DESARROLLO_HANDOFF_KEYS,
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { tags: true, client: { select: { name: true, company: true, industry: true } } },
    }),
  ]);
  const tagsLabel = tagLabels(project?.tags ?? []).join(", ");
  const companyName = project?.client?.name ?? project?.client?.company ?? "el cliente";
  const userMessage = `Empresa: ${companyName}
Industria: ${project?.client?.industry ?? "No especificada"}
${tagsLabel ? `Alcance etiquetado (tags del proyecto): ${tagsLabel}\n` : ""}
=== HANDOFF DEL PROYECTO — DESARROLLO Y ALCANCE (TU ÚNICA FUENTE) ===
${handoffCtx || "(Sin handoff con detalle técnico. Proponé la estructura desde buenas prácticas de HubSpot y marcá lo específico del cliente como ⚠️ Por validar.)"}

Generá el requerimiento técnico siguiendo tus instrucciones: preciso y técnico, con nombres de objetos/propiedades/endpoints de HubSpot; marcá con ⚠️ Por validar lo que no esté confirmado en la fuente; no inventes IDs, propiedades, volúmenes ni SLAs.`;

  // Carry-forward: la generación sobreescribe los bloques EN EL LUGAR — sin la data
  // previa, `coerceToSchema` descartaría cualquier campo fuera de schema. `id` se trae
  // en la misma query (no una segunda) para armar `sectionMap` más abajo.
  const prevDataByKey: Record<string, unknown> = {};
  const prevSecs = await prisma.canvasSection.findMany({
    where: { canvasId },
    select: { id: true, key: true, blocks: { where: { blockType: "CARD" }, select: { data: true }, take: 1 } },
  });
  for (const s of prevSecs) {
    const d = s.blocks[0]?.data;
    if (d && typeof d === "object") prevDataByKey[s.key] = d;
  }

  const gen = await generateSectionsForTemplate(DESARROLLO_TEMPLATE, userMessage, undefined, undefined, prevDataByKey);

  // Persistir 1 CARD/sección EN EL LUGAR. `gen.sections` solo trae las secciones que el
  // agente genera (hero + 5 de contenido); `cierre` (agentGenerated:false, curada) NO
  // viene → su bloque sembrado queda intacto.
  const sectionMap = new Map(prevSecs.map((s) => [s.key, s.id]));
  let sectionCount = 0;
  for (const s of gen.sections) {
    const sectionId = sectionMap.get(s.key);
    if (!sectionId) continue;
    // El diagrama NO lo dibuja la IA: se deriva determinísticamente de la spec
    // string-only y se guarda en `data.diagram` (key fuera de schema → preserve
    // la arrastra en regeneraciones, y acá se recalcula fresco en cada corrida).
    if (s.key === "arquitectura" || s.key === "relacion_objetos") {
      const { diagram, discarded } = s.key === "arquitectura" ? specToDiagram(s.data) : relacionToDiagram(s.data);
      if (discarded > 0) {
        console.warn(`[desarrollo-generate] ${s.key}: ${discarded} conexiones descartadas (desde/hacia sin sistema que matchee)`);
      }
      (s.data as Record<string, unknown>).diagram = diagram;
    }
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
