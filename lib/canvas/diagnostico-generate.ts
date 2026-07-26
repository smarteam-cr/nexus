/**
 * lib/canvas/diagnostico-generate.ts
 *
 * Runner del canvas "Diagnóstico" (informe de rendimiento PARA EL CLIENTE).
 * Self-contained, calcado de `exploracion-generate.ts`: asegura el canvas, arma el input
 * desde las fuentes, corre el agente tipado y persiste 1 CARD por sección EN EL LUGAR.
 *
 * ── LAS FUENTES, y por qué éstas ──────────────────────────────────────────────
 *   1. LA ESCALA 1-5 canónica, desde la base de conocimiento (tag escala_rendimiento).
 *      Es la vara de medición del informe entero. La escala 0-4 vieja del código NO se
 *      lee acá — el diagnóstico se mide con una sola vara.
 *   2. El HANDOFF, con allowlist RESTRICTIVA (cliente-safe): las secciones internas
 *      (riesgos, motivación, acuerdos) NO entran — un dato de esas secciones citado en
 *      un informe que el cliente guarda sería una filtración.
 *   3. La EXPLORACIÓN completa (interna), con la regla dura de que lo marcado "sin
 *      verificar" nunca se afirma como hecho.
 *   4. Los PROCESOS REALES del cliente, serializados de verdad (dolores marcados ⚠ y
 *      notas de fricción) — antes llegaban como "(diagrama de flujo)", inservible.
 *   5. El CRONOGRAMA, solo lectura: ancla el "cómo vas a operar" a lo contratado.
 *
 * Lo dispara el botón del header (CANVAS_PRIMARY_AGENT, async) vía POST /analyze, que
 * gatea permisos, crea el AgentRun detached y delega acá — la corrida se ve en el
 * centro de corridas, igual que Exploración.
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { DIAGNOSTICO_CANVAS, diagnosticoSectionSequence } from "@/lib/canvas/canvas-defs";
import {
  createOnDemandCanvas,
  reconcileOnDemandCanvasSections,
} from "@/lib/canvas/default-canvases";
import { loadCanvasContext, loadTimelineContext } from "@/lib/canvas/load-canvas-context";
import { serializeProcesosForPrompt } from "@/lib/canvas/read-procesos";
import { loadKnowledgeByTags } from "@/lib/knowledge/load-by-tags";
import { generateSectionsForTemplate } from "@/lib/business-cases/canvas-agent";
import { DIAGNOSTICO_TEMPLATE, DIAGNOSTICO_HANDOFF_KEYS } from "@/components/landing/configs/diagnostico.defs";
import { tagLabels } from "@/lib/tags/catalog";
import { canvasOfNested } from "@/lib/pieces/canvas-query";

/** Asegura el canvas "Diagnóstico" del proyecto + reconcilia sus secciones. Idempotente. */
export async function ensureDiagnosticoCanvas(projectId: string): Promise<string> {
  const existing = await prisma.projectCanvas.findFirst({
    where: canvasOfNested(DIAGNOSTICO_CANVAS.slug, { projectId }),
    select: { id: true },
  });
  const canvasId = existing?.id ?? (await createOnDemandCanvas(projectId, DIAGNOSTICO_CANVAS));
  await reconcileOnDemandCanvasSections(canvasId, DIAGNOSTICO_CANVAS, diagnosticoSectionSequence);
  return canvasId;
}

/**
 * Genera (o regenera) el informe de diagnóstico con IA. `agentRunId` se atribuye a los
 * bloques (trazabilidad). Devuelve canvasId + secciones escritas.
 */
export async function runDiagnosticoGeneration(opts: {
  projectId: string;
  agentRunId?: string | null;
  canvasId?: string;
}): Promise<{ canvasId: string; sectionCount: number }> {
  const { projectId } = opts;

  const [canvasId, handoffCtx, exploracionCtx, timelineCtx, escala, project] = await Promise.all([
    opts.canvasId ?? ensureDiagnosticoCanvas(projectId),
    loadCanvasContext(projectId, "handoff", { onlyConfirmed: false, includeKeys: DIAGNOSTICO_HANDOFF_KEYS }),
    loadCanvasContext(projectId, "exploration", { onlyConfirmed: false }),
    loadTimelineContext(projectId),
    /* La vara: el doc canónico de la escala + los criterios por nivel/hub.
       ⚠ El presupuesto tiene que ENTRAR el documento entero, y el de hoy mide 131.733
       caracteres. Con el tope viejo de 20.000 no entraba NUNCA: el cargador lo omitía
       completo y el informe se escribía sin las rúbricas — puntuando al cliente solo con
       los nombres de los cinco niveles, en el documento que se le presenta. Se descubrió
       en la auditoría previa al push.
       El costo es real (unas 35.000 fichas de entrada por diagnóstico) y se paga a
       propósito: la escala ES la vara del informe entero; sin ella el documento vale
       menos que lo que cuesta generarlo. Si el documento crece, subir este número —
       no dejar que se omita en silencio. */
    loadKnowledgeByTags(["escala_rendimiento"], 160000),
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

  const procesosCtx = project?.clientId
    ? await serializeProcesosForPrompt(project.clientId, { onlyConfirmed: false })
    : "";

  const companyName = project?.client?.name ?? project?.client?.company ?? "el cliente";
  const hubs = tagLabels(project?.tags ?? []);

  const userMessage = [
    `Empresa: ${companyName}`,
    `Industria: ${project?.client?.industry ?? "No especificada"}`,
    `Proyecto: ${project?.name ?? "(sin nombre)"}`,
    hubs.length ? `Hubs/áreas del proyecto (dirigen QUÉ procesos cubre el informe): ${hubs.join(", ")}` : "",
    "",
    "=== ESCALA DE RENDIMIENTO 1-5 — TU VARA DE MEDICIÓN ===",
    /* Se decide por `count`, NO por `text`. Cuando ningún documento entra en el
       presupuesto de contexto, `loadKnowledgeByTags` igual devuelve texto: la nota
       "(N documento(s) más no entraron…)". Preguntar por `text` la tomaba como escala
       válida y el respaldo no se usaba nunca — el agente puntuaba al cliente, en un
       informe que se le presenta, sin la vara y sin siquiera los nombres de los niveles.
       Es el mismo criterio que usa su hermano en implementacion-generate.ts. */
    escala.count > 0
      ? escala.text
      : "(El documento de la escala no está publicado en la base de conocimiento. Usá los nombres canónicos —1 Deficiente · 2 Inicial · 3 Funcional · 4 Eficiente · 5 Óptimo— y puntuá SOLO donde la evidencia alcance.)",
    "",
    "=== HANDOFF DEL PROYECTO (solo lo apto para el cliente) ===",
    handoffCtx || "(Sin handoff generado.)",
    exploracionCtx
      ? `\n=== EXPLORACIÓN (interna — lo confirmado y lo supuesto) ===\nREGLA DURA: lo que esta fuente marque como supuesto o "sin verificar" NUNCA se afirma como hecho en el informe.\n${exploracionCtx}`
      : "",
    procesosCtx ? `\n=== PROCESOS REALES DEL CLIENTE (⚠ = fricción detectada) ===\n${procesosCtx}` : "",
    timelineCtx ? `\n${timelineCtx}` : "",
    "",
    "Escribí el informe siguiendo tus instrucciones: ubicá al cliente en la escala 1-5 (global y por área diagnosticada), explicá el nivel con causas trazables, y proyectá el nivel SIGUIENTE — no dos arriba.",
  ]
    .filter((x) => x !== "")
    .join("\n");

  // Carry-forward: sin la data previa, `coerceToSchema` descartaría lo curado fuera de
  // schema (portada del hero, marcas) al regenerar.
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
    DIAGNOSTICO_TEMPLATE,
    userMessage,
    undefined,
    undefined,
    prevDataByKey,
  );

  // Persistir 1 CARD/sección EN EL LUGAR. Las solo-lectura legacy y el `cierre`
  // (agentGenerated:false) no vienen en gen.sections → sus bloques quedan intactos.
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
