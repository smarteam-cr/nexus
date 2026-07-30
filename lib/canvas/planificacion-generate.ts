/**
 * lib/canvas/planificacion-generate.ts
 *
 * Runner del canvas "Planificación" (el plan que el cliente aprueba antes de habilitar
 * el CRM). Self-contained, molde de diagnostico-generate.
 *
 * ── LAS FUENTES ───────────────────────────────────────────────────────────────
 *   1. El DIAGNÓSTICO — la fuente ancla: el plan ataca las causas diagnosticadas.
 *      (Gracias al fallback CARD del contexto, el diagnóstico tipado ya se lee — antes
 *      un canvas del motor llegaba VACÍO.)
 *   2. El HANDOFF completo (documento interno: riesgos y acuerdos incluidos — el plan
 *      no puede planificar contra ellos sin verlos).
 *   3. La EXPLORACIÓN (lo confirmado y lo supuesto).
 *   4. Los PROCESOS REALES serializados — el `comoEsHoy` del rediseño sale de ahí.
 *   5. El REQUERIMIENTO TÉCNICO (si existe): objetos, dedup, triggers.
 *   6. Las ETAPAS REALES del portal (best-effort): el ciclo de vida propuesto parte de
 *      lo que el portal usa hoy, no de un template.
 *   7. La MODALIDAD DE ADOPCIÓN (confirmada, o sugerida por los umbrales de tamaño):
 *      gobierna si el plan de despliegue por olas se escribe o queda vacío.
 *
 * NO escribe el esqueleto del cronograma: esa herencia murió con el short-circuit (el
 * prompt ya tenía la regla "sin fechas"; ahora el código la acompaña).
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { PLANIFICACION_CANVAS, planificacionSectionSequence } from "@/lib/canvas/canvas-defs";
import { createOnDemandCanvas, reconcileOnDemandCanvasSections } from "@/lib/canvas/default-canvases";
import { loadCanvasContext, loadHandoffContext, loadTimelineContext } from "@/lib/canvas/load-canvas-context";
import { serializeProcesosForPrompt } from "@/lib/canvas/read-procesos";
import { loadDesarrolloContext } from "@/lib/canvas/desarrollo-context";
import { loadPortalLifecycleContext } from "@/lib/hubspot/lifecycle-context";
import { generateSectionsForTemplate } from "@/lib/business-cases/canvas-agent";
import { PLANIFICACION_TEMPLATE, PLANIFICACION_HANDOFF_KEYS } from "@/components/landing/configs/planificacion.defs";
import { suggestAdoptionMode } from "@/lib/lifecycle/stage-engine";
import { tagLabels } from "@/lib/tags/catalog";
import { canvasOfNested } from "@/lib/pieces/canvas-query";

/** Asegura el canvas "Planificación" del proyecto + reconcilia. Idempotente. */
export async function ensurePlanificacionCanvas(projectId: string): Promise<string> {
  const existing = await prisma.projectCanvas.findFirst({
    where: canvasOfNested(PLANIFICACION_CANVAS.slug, { projectId }),
    select: { id: true },
  });
  const canvasId = existing?.id ?? (await createOnDemandCanvas(projectId, PLANIFICACION_CANVAS));
  await reconcileOnDemandCanvasSections(canvasId, PLANIFICACION_CANVAS, planificacionSectionSequence);
  return canvasId;
}

/** La modalidad de adopción para el prompt: la confirmada, o la sugerida por tamaño. */
async function adoptionBlock(projectId: string, clientId: string | null): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { adoptionMode: true },
  });
  if (project?.adoptionMode) {
    return `Modalidad de adopción CONFIRMADA por el CSE: ${project.adoptionMode === "por_pilotos" ? "POR PILOTOS (escalonada por olas)" : "DIRECTA (todo el equipo a la vez)"}.`;
  }
  // Sugerencia por los umbrales de tamaño ya definidos (seats / contactos de marketing).
  const snap = clientId
    ? await prisma.clientPartnerSnapshot.findFirst({
        where: { clientId },
        orderBy: { fetchedAt: "desc" },
        select: { seats: true, marketingContactsLimit: true },
      })
    : null;
  const seatsTotal = (() => {
    const s = snap?.seats as Record<string, { limit?: number }> | null;
    if (!s) return null;
    let total = 0;
    for (const v of Object.values(s)) total += v?.limit ?? 0;
    return total || null;
  })();
  const sugerida = suggestAdoptionMode({
    seatsTotal,
    marketingContactsLimit: snap?.marketingContactsLimit ?? null,
  });
  if (!sugerida) {
    return "Modalidad de adopción: sin datos del tamaño del equipo — asumí DIRECTA y declaralo en el hero para que el CSE lo corrija.";
  }
  return `Modalidad de adopción SUGERIDA por tamaño (no confirmada): ${sugerida === "por_pilotos" ? "POR PILOTOS" : "DIRECTA"}. Declarala en el hero como asumida.`;
}

/** Genera (o regenera) el plan con IA. Devuelve canvasId + secciones escritas. */
export async function runPlanificacionGeneration(opts: {
  projectId: string;
  agentRunId?: string | null;
  canvasId?: string;
}): Promise<{ canvasId: string; sectionCount: number }> {
  const { projectId } = opts;

  const [canvasId, handoffCtx, diagnosticoCtx, exploracionCtx, desarrolloCtx, timelineCtx, project] =
    await Promise.all([
      opts.canvasId ?? ensurePlanificacionCanvas(projectId),
      loadHandoffContext(projectId, { onlyConfirmed: false, includeKeys: PLANIFICACION_HANDOFF_KEYS }),
      loadCanvasContext(projectId, "diagnosis", { onlyConfirmed: false }),
      loadCanvasContext(projectId, "exploration", { onlyConfirmed: false }),
      loadDesarrolloContext(projectId),
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

  const [procesosCtx, portalCtx, adopcion] = await Promise.all([
    project?.clientId ? serializeProcesosForPrompt(project.clientId, { onlyConfirmed: false }) : Promise.resolve(""),
    project?.clientId ? loadPortalLifecycleContext(project.clientId) : Promise.resolve(""),
    adoptionBlock(projectId, project?.clientId ?? null),
  ]);

  const companyName = project?.client?.name ?? project?.client?.company ?? "el cliente";
  const hubs = tagLabels(project?.tags ?? []);

  const userMessage = [
    `Empresa: ${companyName}`,
    `Industria: ${project?.client?.industry ?? "No especificada"}`,
    `Proyecto: ${project?.name ?? "(sin nombre)"}`,
    hubs.length ? `Hubs/alcance del proyecto: ${hubs.join(", ")}` : "",
    "",
    `=== MODALIDAD DE ADOPCIÓN ===\n${adopcion}`,
    "",
    "=== DIAGNÓSTICO — TU FUENTE ANCLA (el plan ataca estas causas) ===",
    diagnosticoCtx || "(Sin diagnóstico todavía. Declaralo en el hero: el plan sale del handoff y la exploración, y conviene validarlo contra un diagnóstico cuando exista.)",
    "",
    "=== HANDOFF DEL PROYECTO (completo — documento interno) ===",
    handoffCtx || "(Sin handoff generado.)",
    exploracionCtx ? `\n=== EXPLORACIÓN (lo confirmado y lo supuesto) ===\n${exploracionCtx}` : "",
    procesosCtx ? `\n=== PROCESOS REALES DEL CLIENTE (⚠ = fricción detectada) ===\n${procesosCtx}` : "",
    desarrolloCtx ? `\n=== REQUERIMIENTO TÉCNICO (objetos, dedup, triggers) ===\n${desarrolloCtx}` : "",
    portalCtx ? `\n=== EL PORTAL HOY ===\n${portalCtx}` : "",
    timelineCtx ? `\n${timelineCtx}` : "",
    "",
    "Escribí el plan siguiendo tus instrucciones: rediseño anclado a los procesos reales, ciclo de vida partiendo del portal, rutinas por rol, y el despliegue por olas SOLO si la modalidad es por pilotos. SIN fechas.",
  ]
    .filter((x) => x !== "")
    .join("\n");

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
    PLANIFICACION_TEMPLATE,
    userMessage,
    undefined,
    undefined,
    prevDataByKey,
  );

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
