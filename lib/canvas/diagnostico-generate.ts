/**
 * lib/canvas/diagnostico-generate.ts
 *
 * Runner del canvas "Diagnóstico" (informe de rendimiento PARA EL CLIENTE).
 * Self-contained, calcado de `exploracion-generate.ts`: asegura el canvas, arma el input
 * desde las fuentes, corre el agente tipado y persiste 1 CARD por sección EN EL LUGAR.
 *
 * ── LAS FUENTES, y por qué éstas ──────────────────────────────────────────────
 *   1. LA ESCALA 5.2, el reglamento completo desde la base de conocimiento
 *      (`lib/escala/contexto.ts`). Es la vara del informe entero. Con el proyecto marcado
 *      «Sin Escala», no se carga y la sección `escala` no se genera.
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
import { loadCanvasContext, loadHandoffContext, loadTimelineContext } from "@/lib/canvas/load-canvas-context";
import { serializeProcesosForPrompt } from "@/lib/canvas/read-procesos";
import { escalaParaElDiagnostico, SECCION_DE_ESCALA } from "@/lib/escala/contexto";
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

  const [canvasId, handoffCtx, exploracionCtx, timelineCtx, project] = await Promise.all([
    opts.canvasId ?? ensureDiagnosticoCanvas(projectId),
    loadHandoffContext(projectId, { onlyConfirmed: false, includeKeys: DIAGNOSTICO_HANDOFF_KEYS }),
    loadCanvasContext(projectId, "exploration", { onlyConfirmed: false }),
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

  /* La vara: el reglamento 5.2 entero (~59.000 caracteres, unas 15.000 fichas por diagnóstico) —
     o, con el proyecto marcado «Sin Escala», la instrucción de no ubicar niveles. El tope y la
     regla de decidir por cantidad de documentos viven en `lib/escala/`. */
  const [procesosCtx, escala] = await Promise.all([
    project?.clientId
      ? serializeProcesosForPrompt(project.clientId, { onlyConfirmed: false })
      : Promise.resolve(""),
    escalaParaElDiagnostico(project?.tags ?? []),
  ]);

  const companyName = project?.client?.name ?? project?.client?.company ?? "el cliente";
  const hubs = tagLabels(project?.tags ?? []);

  const userMessage = [
    `Empresa: ${companyName}`,
    `Industria: ${project?.client?.industry ?? "No especificada"}`,
    `Proyecto: ${project?.name ?? "(sin nombre)"}`,
    hubs.length ? `Hubs/áreas del proyecto (dirigen QUÉ procesos cubre el informe): ${hubs.join(", ")}` : "",
    "",
    escala.texto,
    "",
    "=== HANDOFF DEL PROYECTO (solo lo apto para el cliente) ===",
    handoffCtx || "(Sin handoff generado.)",
    exploracionCtx
      ? `\n=== EXPLORACIÓN (interna — lo confirmado y lo supuesto) ===\nREGLA DURA: lo que esta fuente marque como supuesto o "sin verificar" NUNCA se afirma como hecho en el informe.\n${exploracionCtx}`
      : "",
    procesosCtx ? `\n=== PROCESOS REALES DEL CLIENTE (⚠ = fricción detectada) ===\n${procesosCtx}` : "",
    timelineCtx ? `\n${timelineCtx}` : "",
    "",
    escala.usa
      ? "Escribí el informe siguiendo tus instrucciones: ubicá cada área diagnosticada por capa —el piso, no el promedio— con su evidencia, leé la brecha entre capas, explicá el nivel con causas trazables y proyectá el nivel SIGUIENTE, no dos arriba."
      : "Escribí el informe siguiendo tus instrucciones, SIN la Escala: explicá cómo opera hoy y por qué con causas trazables, y qué lo separa de lo que el proyecto tiene que lograr. Ningún nivel en ninguna sección.",
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
  /* ⛔ Las tarjetas «N/5» de un diagnóstico viejo NO viajan a la generación nueva. Son una clave
     fuera del esquema y `preserveNonSchemaKeys` las arrastraría: si esta vez el agente no ubica
     ninguna área, el renderer volvería a mostrar los números de la v4 como si fueran de hoy. */
  const escalaPrevia = prevDataByKey[SECCION_DE_ESCALA.diagnostico];
  if (escalaPrevia && typeof escalaPrevia === "object") {
    const sinTarjetasViejas = { ...(escalaPrevia as Record<string, unknown>) };
    delete sinTarjetasViejas.metrics;
    prevDataByKey[SECCION_DE_ESCALA.diagnostico] = sinTarjetasViejas;
  }

  const gen = await generateSectionsForTemplate(
    DIAGNOSTICO_TEMPLATE,
    userMessage,
    undefined,
    escala.usa ? undefined : new Set([SECCION_DE_ESCALA.diagnostico]),
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
  /* Con el proyecto marcado «Sin Escala» la sección no se generó, pero puede traer lo de una
     corrida anterior. Se vacía: un informe sin Escala que muestra niveles se contradice solo. */
  const seccionDeEscala = sectionMap.get(SECCION_DE_ESCALA.diagnostico);
  if (!escala.usa && seccionDeEscala) {
    await prisma.canvasBlock.deleteMany({ where: { sectionId: seccionDeEscala } });
  }
  return { canvasId, sectionCount };
}
