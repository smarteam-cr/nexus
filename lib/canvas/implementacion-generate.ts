/**
 * lib/canvas/implementacion-generate.ts
 *
 * Runner del canvas "Implementación" (la guía de construcción del CSE).
 *
 * ── EL ORDEN ES LA DOCTRINA ───────────────────────────────────────────────────
 * Primero la arquitectura y recién ahí los prompts para Breeze. Desde el 2026-10-02 la arquitectura
 * (propiedades, pipelines, automatizaciones, conversaciones) se decide en la PLANIFICACIÓN, que el
 * cliente aprueba: esta guía la lee de ahí —solo lo visible— y escribe cómo se construye. Las
 * secciones de arquitectura que vivían acá se ocultan al regenerar (SECCIONES_RETIRADAS_DE_EJECUCION).
 *
 * ── EL GATE DE BREEZE ─────────────────────────────────────────────────────────
 * El alcance de Breeze se carga de la base de conocimiento (PUBLISHED con tags breeze).
 * Con spec: los prompts salen `estado: "listo"`. Sin spec: el agente recibe la
 * instrucción de limitarse a capacidades conservadoras y marcar TODO "sin_verificar".
 * Nunca bloquea — el CSE valida antes de pegar.
 */
import { prisma } from "@/lib/db/prisma";
import { cargarMaterialDelDocumento } from "@/lib/contexto/material-del-documento";
import { documentoConContexto } from "@/lib/contexto/documento";
import { guardarVersionDelDocumento } from "@/lib/canvas/versiones";
import { Prisma } from "@prisma/client";
import { IMPLEMENTACION_CANVAS, implementacionSectionSequence } from "@/lib/canvas/canvas-defs";
import { createOnDemandCanvas, reconcileOnDemandCanvasSections } from "@/lib/canvas/default-canvases";
import { loadCanvasContext, loadHandoffContext } from "@/lib/canvas/load-canvas-context";
import { serializeProcesosForPrompt } from "@/lib/canvas/read-procesos";
import { loadDesarrolloContext } from "@/lib/canvas/desarrollo-context";
import { loadPortalLifecycleContext } from "@/lib/hubspot/lifecycle-context";
import { loadKnowledgeByTags } from "@/lib/knowledge/load-by-tags";
import { generateSectionsForTemplate } from "@/lib/business-cases/canvas-agent";
import {
  IMPLEMENTACION_TEMPLATE,
  BREEZE_KNOWLEDGE_TAGS,
  SECCIONES_RETIRADAS_DE_EJECUCION,
} from "@/components/landing/configs/implementacion.defs";
import { ocultarSeccionesRetiradas } from "@/lib/canvas/retirar-secciones";
import { tagLabels } from "@/lib/tags/catalog";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { memoriaDelDocumento } from "@/lib/memoria";

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
      // Solo lo VISIBLE: lo que el CSE ocultó en la Planificación no se construye.
      loadCanvasContext(projectId, "planning", { onlyConfirmed: false, soloVisibles: true }),
      loadCanvasContext(projectId, "diagnosis", { onlyConfirmed: false }),
      loadHandoffContext(projectId, { onlyConfirmed: false }),
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

  /* El «Contexto adicional» de este documento (lib/contexto/material-del-documento.ts): las reuniones que eligió el
     equipo, enteras (etapa 7: sin elegidas no entra ninguna y `avisoSinReuniones` lo dice), y sus notas. */
  const material = await cargarMaterialDelDocumento(projectId, documentoConContexto("implementation")!);
  /* La memoria de la cuenta y del proyecto (lib/memoria, etapa 3), con el alcance INTERNO (la guía es del CSE): la
     ficha con lo propuesto, la historia, lo fuera de alcance, la auditoría del portal, la preventa, los compromisos
     abiertos y lo que dejaron las reuniones que su material no lee. Los procesos no: ya los lee enteros. */
  const memoria = await memoriaDelDocumento(projectId, {
    lector: "implementation",
    clientId: project?.clientId ?? null,
    yaLeidas: material.sesionesUsadas,
  });

  const companyName = project?.client?.name ?? project?.client?.company ?? "el cliente";
  const hubs = tagLabels(project?.tags ?? []);

  const userMessage = [
    // Las «Instrucciones adicionales» de la ejecución (2026-10-07): primero, porque mandan sobre todo.
    material.instrucciones,
    `Empresa: ${companyName}`,
    `Proyecto: ${project?.name ?? "(sin nombre)"}`,
    hubs.length ? `Hubs/alcance del proyecto: ${hubs.join(", ")}` : "",
    "",
    "=== PLANIFICACIÓN — TU FUENTE ANCLA (lo que se decidió configurar: propiedades, pipelines, automatizaciones, conversaciones) ===",
    planificacionCtx ||
      "(Sin planificación todavía. Dilo en la portada: sin la arquitectura decidida, los prompts salen del handoff y el requerimiento técnico, con más ⚠️ Por validar de lo normal.)",
    diagnosticoCtx ? `\n=== DIAGNÓSTICO (por qué se construye esto) ===\n${diagnosticoCtx}` : "",
    "",
    "=== HANDOFF (alcance contratado) ===",
    handoffCtx || "(Sin handoff generado.)",
    desarrolloCtx
      ? `\n=== REQUERIMIENTO TÉCNICO (propiedades de la integración — NO las dupliques, referencialas) ===\n${desarrolloCtx}`
      : "",
    procesosCtx ? `\n=== PROCESOS REALES DEL CLIENTE ===\n${procesosCtx}` : "",
    portalCtx ? `\n=== EL PORTAL HOY ===\n${portalCtx}` : "",
    material.reuniones
      ? `\n=== LAS REUNIONES ELEGIDAS POR EL EQUIPO PARA LA EJECUCIÓN (con su minuta y lo que se dijo, salvo las marcadas «en resumen»; lo dicho [PUERTAS ADENTRO] no se le atribuye al cliente) ===\n${material.reuniones}`
      : material.avisoSinReuniones
        ? `\n${material.avisoSinReuniones}`
        : "",
    material.notas ? `\n=== NOTAS DEL EQUIPO PARA LA EJECUCIÓN ===\n${material.notas}` : "",
    memoria.texto ? `\n${memoria.texto}` : "",
    // La regla de puertas adentro otra vez: el bloque de reuniones puede ser largo.
    material.cierreDeFrontera ? `\n${material.cierreDeFrontera}` : "",
    "",
    breeze.count > 0
      ? `=== SPEC DE BREEZE (qué puede y qué no puede crear) ===\n${breeze.text}`
      : "=== SPEC DE BREEZE: NO HAY DOCUMENTOS PUBLICADOS ===\nGenerá los prompts igual con capacidades CONSERVADORAS (propiedades, listas, workflows básicos, formularios; pipelines/objetos custom/permisos NO) y marcá TODOS con estado \"sin_verificar\".",
    "",
    "Escribe la guía siguiendo tus instrucciones: PRIMERO la arquitectura (propiedades, pipelines, marketing) que construye las acciones (AC) del diagnóstico, y los prompts derivados de lo decidido arriba — un prompt que construye algo no decidido, sobra.",
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

  // La foto ANTES de escribir (lib/canvas/versiones.ts): la IA ya respondió y todavía no se tocó nada.
  await guardarVersionDelDocumento(canvasId, { origen: "Antes de regenerar" });

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

  /* Las acciones y las herramientas volvieron al diagnóstico el 2026-10-02: una guía regenerada ya
     no las muestra (se OCULTAN, no se borran — lib/canvas/retirar-secciones.ts). */
  if (sectionCount > 0) {
    await ocultarSeccionesRetiradas(canvasId, prevSecs.map((s) => s.key), SECCIONES_RETIRADAS_DE_EJECUCION);
  }
  return { canvasId, sectionCount };
}
