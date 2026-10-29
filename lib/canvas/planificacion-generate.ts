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
 *   8. Las reuniones ELEGIDAS por el equipo en su «Contexto adicional», leídas enteras (etapa 7: sin
 *      elegidas no entra ninguna, y la línea lo dice), y sus notas.
 *   9. La MEMORIA de la cuenta y del proyecto (lib/memoria, alcance del cliente): lo que dejaron las
 *      demás reuniones, la historia, las desviaciones que el cliente ve y los resultados confirmados.
 *      Sin la ficha ni los procesos: ya los lee arriba.
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
import { fronteraDeLaPieza } from "@/lib/contexto/frontera-de-los-documentos";
import { guardarVersionDelDocumento } from "@/lib/canvas/versiones";
import { loadCuestionarioContext } from "@/lib/cuestionario/contexto";
import { fichaParaPrompt, leerFicha } from "@/lib/clients/ficha";
import { Prisma } from "@prisma/client";
import { PLANIFICACION_CANVAS, planificacionSectionSequence } from "@/lib/canvas/canvas-defs";
import { createOnDemandCanvas, reconcileOnDemandCanvasSections } from "@/lib/canvas/default-canvases";
import type { CanvasDefinition } from "@/lib/canvas/canvas-defs";
import { ajustarALaPlantilla } from "@/lib/canvas/diagnostico-generate";
import { loadCanvasContext, loadHandoffContext, loadTimelineContext } from "@/lib/canvas/load-canvas-context";
import { serializeProcesosForPrompt } from "@/lib/canvas/read-procesos";
import { loadDesarrolloContext } from "@/lib/canvas/desarrollo-context";
import { loadPortalLifecycleContext } from "@/lib/hubspot/lifecycle-context";
import { generateSectionsForTemplate } from "@/lib/business-cases/canvas-agent";
import type { BcTemplateDef } from "@/components/landing/configs/templates.defs";
import { bloqueDeInstruccionesDelPedido } from "@/lib/entregables/registro";
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
import { memoriaDelDocumento } from "@/lib/memoria";

/**
 * Asegura el canvas "Planificación" del proyecto + reconcilia. Idempotente. Con `plantilla`, reconcilia SOLO a las
 * secciones de esa plantilla (I2, 2026-10-27): la planificación esencial no gana las de la completa.
 */
export async function ensurePlanificacionCanvas(projectId: string, plantilla?: BcTemplateDef): Promise<string> {
  const existing = await prisma.projectCanvas.findFirst({
    where: canvasOfNested(PLANIFICACION_CANVAS.slug, { projectId }),
    select: { id: true },
  });
  const def = planificacionDeLaPlantilla(plantilla);
  const canvasId = existing?.id ?? (await createOnDemandCanvas(projectId, def));
  await reconcileOnDemandCanvasSections(canvasId, def, planificacionSectionSequence);
  return canvasId;
}

/** El canvas de la planificación con solo las secciones de la plantilla (todas, sin plantilla o con la completa). */
function planificacionDeLaPlantilla(plantilla?: BcTemplateDef): CanvasDefinition {
  if (!plantilla) return PLANIFICACION_CANVAS;
  const keys = new Set(plantilla.sections.map((d) => d.key));
  return { ...PLANIFICACION_CANVAS, sections: PLANIFICACION_CANVAS.sections.filter((s) => keys.has(s.key)) };
}

/**
 * EMPEZAR EN BLANCO (I2, 2026-10-27): la planificación con las secciones de la plantilla elegida, sin la IA. La plantilla
 * la anota quien llama (lib/entregables/generar-server.ts). Lo que la plantilla no tiene: vacío se borra, con algo se oculta.
 */
export async function prepararPlanificacionEnBlanco(projectId: string, plantilla: BcTemplateDef): Promise<string> {
  const canvasId = await ensurePlanificacionCanvas(projectId, plantilla);
  await ajustarALaPlantilla(canvasId, planificacionDeLaPlantilla(plantilla), PLANIFICACION_CANVAS);
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
  /** La plantilla con que se genera (lib/entregables/plantillas.ts). Sin ella, la de siempre. */
  plantilla?: BcTemplateDef;
  /** Lo que pidió quien genera, para esta corrida (el chat de Nexus). Sin ellas, el mensaje es el de siempre. */
  instrucciones?: string | null;
}): Promise<{ canvasId: string; sectionCount: number }> {
  const { projectId } = opts;

  const [canvasId, handoffCtx, diagnosticoCtx, exploracionCtx, desarrolloCtx, timelineCtx, project, cuestionarioCtx] =
    await Promise.all([
      opts.canvasId ?? ensurePlanificacionCanvas(projectId, opts.plantilla),
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

  /* El «Contexto adicional» de este documento (lib/contexto/material-del-documento.ts): las reuniones que eligió el
     equipo, enteras (etapa 7: sin elegidas no entra ninguna y `avisoSinReuniones` lo dice), y sus notas. */
  const material = await cargarMaterialDelDocumento(projectId, documentoConContexto("planning")!);

  // La ficha del cliente CONFIRMADA (2026-10-05): lo que la exploración averigua del cliente ya no
  // viaja en las sesiones, va a la ficha. ⛔ Sin los campos internos: el plan lo ve el cliente.
  const fichaCtx = fichaParaPrompt(leerFicha(project?.client?.ficha), { paraDocumentoDelCliente: true });
  /* La memoria de la cuenta y del proyecto (lib/memoria), con el alcance del CLIENTE: el plan lo ve el cliente. Suma
     lo que dejaron las reuniones que su material NO lee (`yaLeidas`: solo acuerdos y decisiones de minutas revisadas),
     la historia, las desviaciones que el cliente ve y los resultados confirmados. Desde la etapa 7 lleva el peso cuando
     nadie eligió reuniones. */
  const memoria = await memoriaDelDocumento(projectId, {
    lector: "planning",
    clientId: project?.clientId ?? null,
    yaLeidas: material.sesionesUsadas,
  });

  const companyName = project?.client?.name ?? project?.client?.company ?? "el cliente";
  const hubs = tagLabels(project?.tags ?? []);

  const userMessage = [
    // Lo que pidió quien genera ESTA corrida (el chat de Nexus); "" sin ellas y el filtro lo saca.
    bloqueDeInstruccionesDelPedido(opts.instrucciones),
    // Las «Instrucciones adicionales» de la planificación (2026-10-07): primero, porque mandan sobre todo.
    material.instrucciones,
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
    // La frontera también acá: la exploración trae lo que salió de cada sesión y citas de lo que se dijo.
    exploracionCtx ? `\n=== EXPLORACIÓN (lo confirmado y lo supuesto) ===\n${fronteraDeLaPieza("planning")}\n${exploracionCtx}` : "",
    procesosCtx
      ? `\n=== MAPAS DE PROCESOS DEL CLIENTE (qué procesos existen; ⚠ = fricción. Una fuente más: lo que ninguna reunión menciona es, a lo sumo, un supuesto) ===\n${procesosCtx}`
      : "",
    cuestionarioCtx ? `\n${cuestionarioCtx}` : "",
    desarrolloCtx ? `\n=== REQUERIMIENTO TÉCNICO (objetos, dedup, triggers) ===\n${desarrolloCtx}` : "",
    portalCtx ? `\n=== EL PORTAL HOY ===\n${portalCtx}` : "",
    timelineCtx ? `\n${timelineCtx}` : "",
    material.reuniones
      ? `\n=== LAS REUNIONES ELEGIDAS POR EL EQUIPO PARA LA PLANIFICACIÓN (con su minuta y lo que se dijo, salvo las marcadas «en resumen»; lo dicho [PUERTAS ADENTRO] no se le atribuye al cliente) ===\n${material.reuniones}`
      : material.avisoSinReuniones
        ? `\n${material.avisoSinReuniones}`
        : "",
    material.notas ? `\n=== NOTAS DEL EQUIPO PARA LA PLANIFICACIÓN ===\n${material.notas}` : "",
    memoria.texto ? `\n${memoria.texto}` : "",
    // La regla otra vez, justo antes de la instrucción: el bloque de reuniones puede ser largo.
    material.cierreDeFrontera ? `\n${material.cierreDeFrontera}` : "",
    "",
    "Escribe la planificación siguiendo tus instrucciones: las acciones del diagnóstico bajadas a lo que va a quedar configurado en HubSpot, respetando su enfoque de la solución — cada acción en detalle (una fila por acción, con su mismo código), cómo van a funcionar los procesos (solo lo que se hará), etapas del ciclo de vida, arquitectura, propiedades por objeto, pipelines, automatizaciones y conversaciones, cada cosa con su origen —, rutinas por rol, y el despliegue por olas SOLO si la modalidad es por pilotos. SIN fechas.",
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
    opts.plantilla ?? PLANIFICACION_TEMPLATE,
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
    // El documento queda con las secciones de su plantilla (I2): lo de la completa, oculto o borrado si está vacío.
    await ajustarALaPlantilla(canvasId, planificacionDeLaPlantilla(opts.plantilla), PLANIFICACION_CANVAS);
  }
  return { canvasId, sectionCount };
}
