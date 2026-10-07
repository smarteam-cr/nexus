/**
 * lib/canvas/planificacion-generate.ts
 *
 * Runner del canvas "Planificación": lo que va a quedar configurado en HubSpot, que el cliente
 * aprueba antes de configurar (2026-10-02). Self-contained, molde de diagnostico-generate.
 *
 * ── LAS FUENTES ───────────────────────────────────────────────────────────────
 *   1. El DIAGNÓSTICO — la fuente ancla: el plan ataca las causas diagnosticadas.
 *      (Gracias al fallback CARD del contexto, el diagnóstico tipado ya se lee — antes
 *      un canvas del motor llegaba VACÍO.)
 *   2. El HANDOFF completo (documento interno: riesgos y acuerdos incluidos — el plan
 *      no puede planificar contra ellos sin verlos).
 *   3. La EXPLORACIÓN (lo confirmado y lo supuesto).
 *   4. Los MAPAS DE PROCESOS del cliente: qué procesos existen. Son una fuente más — lo que ninguna
 *      reunión menciona es, a lo sumo, un supuesto. La Planificación solo dice lo que se hará.
 *   5. El REQUERIMIENTO TÉCNICO (si existe): objetos, dedup, triggers.
 *   6. Las ETAPAS REALES del portal (best-effort): el ciclo de vida propuesto parte de
 *      lo que el portal usa hoy, no de un template.
 *   7. La MODALIDAD DE ADOPCIÓN (confirmada, o sugerida por los umbrales de tamaño):
 *      gobierna si el plan de despliegue por olas se escribe o queda vacío.
 *
 * NO escribe el esqueleto del cronograma: esa herencia murió con el short-circuit (el
 * prompt ya tenía la regla "sin fechas"; ahora el código la acompaña).
 *
 * Las PROPIEDADES que escribió una persona (o que vinieron de una plantilla) sobreviven a regenerar:
 * `fusionarFilas` (lib/planificacion/propiedades.ts) reemplaza solo las del agente.
 */
import { prisma } from "@/lib/db/prisma";
import { cargarMaterialDelDocumento } from "@/lib/contexto/material-del-documento";
import { documentoConContexto } from "@/lib/contexto/documento";
import { guardarVersionDelDocumento } from "@/lib/canvas/versiones";
import { loadCuestionarioContext } from "@/lib/cuestionario/contexto";
import { fichaParaPrompt, leerFicha } from "@/lib/clients/ficha";
import { Prisma } from "@prisma/client";
import { PLANIFICACION_CANVAS, planificacionSectionSequence } from "@/lib/canvas/canvas-defs";
import { createOnDemandCanvas, reconcileOnDemandCanvasSections } from "@/lib/canvas/default-canvases";
import { loadCanvasContext, loadHandoffContext, loadTimelineContext } from "@/lib/canvas/load-canvas-context";
import { serializeProcesosForPrompt } from "@/lib/canvas/read-procesos";
import { loadDesarrolloContext } from "@/lib/canvas/desarrollo-context";
import { loadPortalLifecycleContext } from "@/lib/hubspot/lifecycle-context";
import { generateSectionsForTemplate } from "@/lib/business-cases/canvas-agent";
import {
  PLANIFICACION_TEMPLATE,
  PLANIFICACION_HANDOFF_KEYS,
  SECCIONES_RETIRADAS_DE_PLANIFICACION,
} from "@/components/landing/configs/planificacion.defs";
import { ocultarSeccionesRetiradas } from "@/lib/canvas/retirar-secciones";
import { suggestAdoptionMode } from "@/lib/lifecycle/stage-engine";
import { tagLabels } from "@/lib/tags/catalog";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { fusionarFilas, type FilaPropiedad } from "@/lib/planificacion/propiedades";

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
    return "Modalidad de adopción: sin datos del tamaño del equipo — asume DIRECTA y decláralo en la intro de las rutinas de adopción para que el CSE lo corrija.";
  }
  return `Modalidad de adopción SUGERIDA por tamaño (no confirmada): ${sugerida === "por_pilotos" ? "POR PILOTOS" : "DIRECTA"}. Decláralo en la intro de las rutinas de adopción como asumida.`;
}

/** Genera (o regenera) el plan con IA. Devuelve canvasId + secciones escritas. */
export async function runPlanificacionGeneration(opts: {
  projectId: string;
  agentRunId?: string | null;
  canvasId?: string;
}): Promise<{ canvasId: string; sectionCount: number }> {
  const { projectId } = opts;

  const [canvasId, handoffCtx, diagnosticoCtx, exploracionCtx, desarrolloCtx, timelineCtx, project, cuestionarioCtx] =
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
          client: { select: { name: true, company: true, industry: true, ficha: true } },
        },
      }),
      // Las etapas que el cliente describió en el cuestionario previo = las filas del proceso.
      loadCuestionarioContext(projectId).catch(() => ""),
    ]);

  const [procesosCtx, portalCtx, adopcion] = await Promise.all([
    project?.clientId ? serializeProcesosForPrompt(project.clientId, { onlyConfirmed: false }) : Promise.resolve(""),
    project?.clientId ? loadPortalLifecycleContext(project.clientId) : Promise.resolve(""),
    adoptionBlock(projectId, project?.clientId ?? null),
  ]);

  // El «Contexto» de este documento (lib/contexto/material-del-documento.ts): sus reuniones y notas.
  const material = await cargarMaterialDelDocumento(projectId, documentoConContexto("planning")!);

  // La ficha del cliente CONFIRMADA (2026-10-05): lo que la exploración averigua del cliente ya no
  // viaja en las sesiones, va a la ficha. ⛔ Sin los campos internos: el plan lo ve el cliente.
  const fichaCtx = fichaParaPrompt(leerFicha(project?.client?.ficha), { paraDocumentoDelCliente: true });

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
    diagnosticoCtx || "(Sin diagnóstico todavía. Dilo en el subhead de la portada: el plan sale de las reuniones, el handoff y la exploración, y conviene validarlo contra un diagnóstico cuando exista.)",
    "",
    "=== HANDOFF DEL PROYECTO (completo — documento interno) ===",
    handoffCtx || "(Sin handoff generado.)",
    fichaCtx ? `\n${fichaCtx}` : "",
    exploracionCtx ?`\n=== EXPLORACIÓN (lo confirmado y lo supuesto) ===\n${exploracionCtx}` : "",
    procesosCtx
      ? `\n=== MAPAS DE PROCESOS DEL CLIENTE (qué procesos existen; ⚠ = fricción. Una fuente más: lo que ninguna reunión menciona es, a lo sumo, un supuesto) ===\n${procesosCtx}`
      : "",
    cuestionarioCtx ? `\n${cuestionarioCtx}` : "",
    desarrolloCtx ? `\n=== REQUERIMIENTO TÉCNICO (objetos, dedup, triggers) ===\n${desarrolloCtx}` : "",
    portalCtx ? `\n=== EL PORTAL HOY ===\n${portalCtx}` : "",
    timelineCtx ? `\n${timelineCtx}` : "",
    material.reuniones
      ? `\n=== LAS SESIONES DEL CONTEXTO DE LA PLANIFICACIÓN (las reuniones del proyecto con el cliente, curadas por el equipo; lo dicho [PUERTAS ADENTRO] no se le atribuye al cliente) ===\n${material.reuniones}`
      : "",
    material.notas ? `\n=== NOTAS DEL EQUIPO PARA LA PLANIFICACIÓN ===\n${material.notas}` : "",
    "",
    "Escribe la planificación siguiendo tus instrucciones: las acciones del diagnóstico bajadas a lo que va a quedar configurado en HubSpot, respetando su política rectora — cómo van a funcionar los procesos (solo lo que se hará), etapas del ciclo de vida, arquitectura, propiedades por objeto, pipelines, automatizaciones y conversaciones, cada cosa con su origen —, rutinas por rol, y el despliegue por olas SOLO si la modalidad es por pilotos. SIN fechas.",
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

  /* Las propiedades de una persona o de una plantilla no se pisan: el agente reemplaza solo las suyas.
     `coerceToSchema` ya le sacó a cada fila nueva lo que no es del esquema (id, autor, extra). */
  for (const s of gen.sections) {
    if (s.key !== "propiedades" || !s.data || typeof s.data !== "object") continue;
    const nuevas = (s.data as { filas?: FilaPropiedad[] }).filas ?? [];
    const previas = ((prevDataByKey.propiedades as { filas?: FilaPropiedad[] } | undefined)?.filas ?? []).filter(
      (f) => f && typeof f === "object",
    );
    s.data = { ...(s.data as object), filas: fusionarFilas(previas, Array.isArray(nuevas) ? nuevas : []) };
  }

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

  /* Lo que salió el 2026-10-02 —la política rectora (al diagnóstico), la hoja de ruta y las métricas—:
     un plan regenerado ya no lo muestra (se OCULTA, no se borra — lib/canvas/retirar-secciones.ts). */
  if (sectionCount > 0) {
    await ocultarSeccionesRetiradas(canvasId, prevSecs.map((s) => s.key), SECCIONES_RETIRADAS_DE_PLANIFICACION);
  }
  return { canvasId, sectionCount };
}
