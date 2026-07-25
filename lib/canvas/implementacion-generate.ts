/**
 * lib/canvas/implementacion-generate.ts
 *
 * Runner del canvas "Implementación" (la guía de construcción del CSE).
 *
 * ── EL ORDEN ES LA DOCTRINA ───────────────────────────────────────────────────
 * Primero la arquitectura (propiedades, pipelines, procesos de marketing) — derivada de
 * la PLANIFICACIÓN aprobada y del REQUERIMIENTO TÉCNICO — y recién ahí los prompts para
 * Breeze. El prompt del template lo repite; acá se materializa en las fuentes.
 *
 * ── EL GATE DE BREEZE ─────────────────────────────────────────────────────────
 * El alcance de Breeze se carga de la base de conocimiento (PUBLISHED con tags breeze).
 * Con spec: los prompts salen `estado: "listo"`. Sin spec: el agente recibe la
 * instrucción de limitarse a capacidades conservadoras y marcar TODO "sin_verificar".
 * Nunca bloquea — el CSE valida antes de pegar.
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { IMPLEMENTACION_CANVAS, implementacionSectionSequence } from "@/lib/canvas/canvas-defs";
import { createOnDemandCanvas, reconcileOnDemandCanvasSections } from "@/lib/canvas/default-canvases";
import { loadCanvasContext } from "@/lib/canvas/load-canvas-context";
import { serializeProcesosForPrompt } from "@/lib/canvas/read-procesos";
import { loadDesarrolloContext } from "@/lib/canvas/desarrollo-context";
import { loadPortalLifecycleContext } from "@/lib/hubspot/lifecycle-context";
import { loadKnowledgeByTags } from "@/lib/knowledge/load-by-tags";
import { generateSectionsForTemplate } from "@/lib/business-cases/canvas-agent";
import { IMPLEMENTACION_TEMPLATE, BREEZE_KNOWLEDGE_TAGS } from "@/components/landing/configs/implementacion.defs";
import { tagLabels } from "@/lib/tags/catalog";
import { canvasOfNested } from "@/lib/pieces/canvas-query";

/** Asegura el canvas "Implementación" + reconcilia. Idempotente. */
export async function ensureImplementacionCanvas(projectId: string): Promise<string> {
  const existing = await prisma.projectCanvas.findFirst({
    where: canvasOfNested(IMPLEMENTACION_CANVAS.slug, { projectId }),
    select: { id: true },
  });
  const canvasId = existing?.id ?? (await createOnDemandCanvas(projectId, IMPLEMENTACION_CANVAS));
  await reconcileOnDemandCanvasSections(canvasId, IMPLEMENTACION_CANVAS, implementacionSectionSequence);
  return canvasId;
}

/** Genera (o regenera) la guía de construcción con IA. */
export async function runImplementacionGeneration(opts: {
  projectId: string;
  agentRunId?: string | null;
  canvasId?: string;
}): Promise<{ canvasId: string; sectionCount: number }> {
  const { projectId } = opts;

  const [canvasId, planificacionCtx, diagnosticoCtx, handoffCtx, desarrolloCtx, breeze, project] =
    await Promise.all([
      opts.canvasId ?? ensureImplementacionCanvas(projectId),
      loadCanvasContext(projectId, "planning", { onlyConfirmed: false }),
      loadCanvasContext(projectId, "diagnosis", { onlyConfirmed: false }),
      loadCanvasContext(projectId, "handoff", { onlyConfirmed: false }),
      loadDesarrolloContext(projectId),
      loadKnowledgeByTags([...BREEZE_KNOWLEDGE_TAGS], 15000),
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

  const [procesosCtx, portalCtx] = await Promise.all([
    project?.clientId ? serializeProcesosForPrompt(project.clientId, { onlyConfirmed: false }) : Promise.resolve(""),
    project?.clientId ? loadPortalLifecycleContext(project.clientId) : Promise.resolve(""),
  ]);

  const companyName = project?.client?.name ?? project?.client?.company ?? "el cliente";
  const hubs = tagLabels(project?.tags ?? []);

  const userMessage = [
    `Empresa: ${companyName}`,
    `Proyecto: ${project?.name ?? "(sin nombre)"}`,
    hubs.length ? `Hubs/alcance del proyecto: ${hubs.join(", ")}` : "",
    "",
    "=== PLANIFICACIÓN — TU FUENTE ANCLA (qué se decidió construir) ===",
    planificacionCtx ||
      "(Sin planificación todavía. Declaralo en el hero y derivá la arquitectura del handoff y el requerimiento técnico — con más ⚠️ Por validar de lo normal.)",
    diagnosticoCtx ? `\n=== DIAGNÓSTICO (por qué se construye esto) ===\n${diagnosticoCtx}` : "",
    "",
    "=== HANDOFF (alcance contratado) ===",
    handoffCtx || "(Sin handoff generado.)",
    desarrolloCtx
      ? `\n=== REQUERIMIENTO TÉCNICO (propiedades de la integración — NO las dupliques, referencialas) ===\n${desarrolloCtx}`
      : "",
    procesosCtx ? `\n=== PROCESOS REALES DEL CLIENTE ===\n${procesosCtx}` : "",
    portalCtx ? `\n=== EL PORTAL HOY ===\n${portalCtx}` : "",
    "",
    breeze.count > 0
      ? `=== SPEC DE BREEZE (qué puede y qué no puede crear) ===\n${breeze.text}`
      : "=== SPEC DE BREEZE: NO HAY DOCUMENTOS PUBLICADOS ===\nGenerá los prompts igual con capacidades CONSERVADORAS (propiedades, listas, workflows básicos, formularios; pipelines/objetos custom/permisos NO) y marcá TODOS con estado \"sin_verificar\".",
    "",
    "Escribí la guía siguiendo tus instrucciones: PRIMERO la arquitectura (propiedades, pipelines, marketing), y los prompts derivados de lo decidido arriba — un prompt que construye algo no decidido, sobra.",
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
    IMPLEMENTACION_TEMPLATE,
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
