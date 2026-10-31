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
 *   8. Las reuniones del proyecto: las ELEGIDAS por el equipo en su «Contexto adicional» y, desde el 2026-10-29, las del
 *      proyecto CON EL CLIENTE que dejaron texto, sin que nadie las elija (`reunionesQueEntranSolasALaPlanificacion`, la
 *      regla del diagnóstico). Antes, una planificación nueva no leía ninguna reunión hasta que alguien tocaba «Usar» en
 *      cada una (SmartAgro, Liliana). Las 6 más recientes enteras, las demás en resumen; y sus notas.
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
import { cargarMaterialDelDocumento, cierreDeFronteraDelDocumento } from "@/lib/contexto/material-del-documento";
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
import { reunionesQueEntranSolasALaPlanificacion } from "@/lib/contexto/sugerencias-del-documento-server";
import { isBlank } from "@/lib/landing/is-blank";
import { BRIEF_IMPORTADO_KEY, briefParaElPrompt } from "@/lib/planificacion/brief-importado";
import { totalDeAsientos } from "@/lib/planificacion/plantilla-sugerida";
import { conPorQueVacia } from "@/lib/landing/por-que-vacia";
import { POR_QUE_DE_LAS_CURADAS, porQueQuedoVacia, type LoQueSeLeyo } from "@/lib/planificacion/por-que-vacia";
import type { BCSectionDef } from "@/components/landing/configs/business-case.defs";

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

/**
 * La modalidad de adopción para el prompt del PLAN DE ADOPCIÓN (lib/artefactos/generar-server.ts), que desde el 2026-10-30
 * escribe las rutinas y el despliegue por olas: la confirmada, o la sugerida por tamaño.
 */
export async function modalidadDeAdopcion(projectId: string, clientId: string | null): Promise<{ texto: string; directa: boolean }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { adoptionMode: true },
  });
  if (project?.adoptionMode) {
    return {
      texto: `Modalidad de adopción CONFIRMADA por el CSE: ${project.adoptionMode === "por_pilotos" ? "POR PILOTOS (escalonada por olas)" : "DIRECTA (todo el equipo a la vez)"}.`,
      directa: project.adoptionMode !== "por_pilotos",
    };
  }
  // Sugerencia por los umbrales de tamaño ya definidos (seats / contactos de marketing).
  const snap = clientId
    ? await prisma.clientPartnerSnapshot.findFirst({
        where: { clientId },
        orderBy: { fetchedAt: "desc" },
        select: { seats: true, marketingContactsLimit: true },
      })
    : null;
  const seatsTotal = totalDeAsientos(snap?.seats);
  const sugerida = suggestAdoptionMode({
    seatsTotal,
    marketingContactsLimit: snap?.marketingContactsLimit ?? null,
  });
  if (!sugerida) {
    return {
      texto: "Modalidad de adopción: sin datos del tamaño del equipo — asume DIRECTA y decláralo en la intro de las rutinas de adopción para que el CSE lo corrija.",
      directa: true,
    };
  }
  return {
    texto: `Modalidad de adopción SUGERIDA por tamaño (no confirmada): ${sugerida === "por_pilotos" ? "POR PILOTOS" : "DIRECTA"}. Decláralo en la intro de las rutinas de adopción como asumida.`,
    directa: sugerida !== "por_pilotos",
  };
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

  const [procesosCtx, portalCtx] = await Promise.all([
    project?.clientId ? serializeProcesosForPrompt(project.clientId, { onlyConfirmed: false }) : Promise.resolve(""),
    project?.clientId ? loadPortalLifecycleContext(project.clientId) : Promise.resolve(""),
  ]);

  /* El «Contexto adicional» de este documento (lib/contexto/material-del-documento.ts): las reuniones que eligió el
     equipo y las del proyecto con texto que entran solas (2026-10-29), y sus notas. Si las que entran solas no se pueden
     leer, la planificación sale con las elegidas: nunca la frena. */
  const solas = await reunionesQueEntranSolasALaPlanificacion(projectId).catch((e: unknown) => {
    console.warn("[planificacion-generate] las reuniones que entran solas no se pudieron leer:", e instanceof Error ? e.message : e);
    return [] as string[];
  });
  // `primero` vacío: las elegidas a mano van primero (`planDeLasElegidas`). Sin él, los últimos seguimientos las desplazan.
  const material = await cargarMaterialDelDocumento(projectId, documentoConContexto("planning")!, { sumarReuniones: solas, primero: [] });

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

  /* El Brief de implementación que el equipo ya llenó, si se trajo de la hoja (2026-10-29, pregunta 32): una fuente más,
     escrita por el equipo con el cliente. Vive en una sección solo interna; acá solo se lee. */
  const briefDeLaHoja = await prisma.canvasBlock
    .findFirst({
      where: { blockType: "CARD", section: { canvasId, key: BRIEF_IMPORTADO_KEY } },
      orderBy: { order: "asc" },
      select: { data: true },
    })
    .then((b) => briefParaElPrompt(b?.data))
    .catch((e: unknown) => {
      console.warn("[planificacion-generate] el Brief no se pudo leer:", e instanceof Error ? e.message : e);
      return "";
    });

  // La regla al final del mensaje: con reuniones o notas la trae el material; con solo el Brief, también hace falta.
  const cierreDeFrontera =
    material.cierreDeFrontera ||
    (briefDeLaHoja ? cierreDeFronteraDelDocumento("planning", { reuniones: true, notas: false, transcripciones: false }) : "");

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
      ? `\n=== LAS REUNIONES DEL PROYECTO CON TEXTO Y LAS ELEGIDAS POR EL EQUIPO PARA LA PLANIFICACIÓN (con su minuta y lo que se dijo, salvo las marcadas «en resumen»; lo dicho [PUERTAS ADENTRO] no se le atribuye al cliente) ===\n${material.reuniones}`
      : material.avisoSinReuniones
        ? `\n${material.avisoSinReuniones}`
        : "",
    briefDeLaHoja
      ? `\n=== EL BRIEF DE IMPLEMENTACIÓN QUE LLENÓ EL EQUIPO (la hoja de Google, pestaña por pestaña. Es una hoja INTERNA del equipo: úsala para saber qué configurar, y es 'acordado' solo si una reunión lo respalda. De ella NO pases al documento correos, teléfonos, nombres de personas, comentarios del equipo ni nada de precios) ===\n${fronteraDeLaPieza("planning")}\n${briefDeLaHoja}`
      : "",
    material.notas ? `\n=== NOTAS DEL EQUIPO PARA LA PLANIFICACIÓN ===\n${material.notas}` : "",
    memoria.texto ? `\n${memoria.texto}` : "",
    // La regla otra vez, justo antes de la instrucción: el bloque de reuniones puede ser largo.
    cierreDeFrontera ? `\n${cierreDeFrontera}` : "",
    "",
    "SI UNA SECCIÓN QUEDA VACÍA: no la rellenes con supuestos para que no quede en blanco. Déjala vacía y agrega al JSON la key extra \"__vacias\": un objeto { key de sección: una frase } con el porqué de CADA sección que dejaste vacía, en primera persona y nombrando lo que faltó (p.ej. \"No encontré en las reuniones con qué llenar los pipelines: nadie habló de las etapas de la venta.\"). Una frase corta por sección; la lee solo el equipo, nunca el cliente. No la pongas en una sección con contenido.",
    "Escribe la planificación siguiendo tus instrucciones: las acciones del diagnóstico bajadas a lo que va a quedar configurado en HubSpot, respetando su enfoque de la solución — cada acción en detalle (una fila por acción, con su mismo código), cómo van a funcionar los procesos (solo lo que se hará), etapas del ciclo de vida, arquitectura, propiedades por objeto, pipelines, automatizaciones y conversaciones, cada cosa con su origen. SIN fechas.",
  ]
    .filter((x) => x !== "")
    .join("\n");

  const prevDataByKey: Record<string, unknown> = {};
  const prevSecs = await prisma.canvasSection.findMany({
    where: { canvasId },
    select: { id: true, key: true, blocks: { where: { blockType: "CARD" }, select: { id: true, data: true, source: true }, orderBy: { order: "asc" }, take: 1 } },
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

  /* EL PORQUÉ DE LAS VACÍAS (2026-10-29, Elías: «en vez de entregarlas en blanco, deberían por lo menos explicar por
     qué»). Cada sección que quedó vacía lleva su línea (`__porQueVacia`, lib/landing/por-que-vacia.ts): la ve el equipo
     como aviso, el cliente no. Las que tienen contenido la pierden (preserveNonSchemaKeys traía la de la corrida anterior). */
  const tpl = opts.plantilla ?? PLANIFICACION_TEMPLATE;
  const defPorKey = new Map(tpl.sections.map((d) => [d.key, d]));
  const loQueSeLeyo: LoQueSeLeyo = {
    porQueDelAgente: gen.porQueVacias,
    hayDiagnostico: !!diagnosticoCtx,
    leyoReuniones: material.sesionesUsadas.length > 0,
  };
  /* Lo que escribió una persona en una sección que el agente hoy deja vacía se queda: el agente no ve ese texto, y borrarlo
     para decir «no encontré con qué llenarla» sería perderlo y además mentir. */
  // Se relee: la corrida tarda minutos, y lo escrito mientras tanto también se queda.
  const vivas = await prisma.canvasSection.findMany({
    where: { canvasId },
    select: { key: true, blocks: { where: { blockType: "CARD" }, select: { data: true, source: true }, orderBy: { order: "asc" }, take: 1 } },
  });
  const seQuedan = new Set<string>();
  for (const s of gen.sections) {
    const def = defPorKey.get(s.key);
    if (!def || !s.data || typeof s.data !== "object") continue;
    const vacia = seccionVacia(def, s.data);
    const previo = vivas.find((p) => p.key === s.key)?.blocks[0];
    if (vacia && previo && previo.source !== "AGENT" && !seccionVacia(def, previo.data)) {
      seQuedan.add(s.key);
      continue;
    }
    s.data = conPorQueVacia(s.data as object, vacia ? porQueQuedoVacia({ key: def.key, label: def.label, agentGenerated: true }, loQueSeLeyo) : null);
  }

  // La foto ANTES de escribir (lib/canvas/versiones.ts): la IA ya respondió y todavía no se tocó nada.
  await guardarVersionDelDocumento(canvasId, { origen: "Antes de regenerar" });

  const sectionMap = new Map(prevSecs.map((s) => [s.key, s.id]));
  let sectionCount = 0;
  for (const s of gen.sections) {
    const sectionId = sectionMap.get(s.key);
    if (!sectionId || seQuedan.has(s.key)) continue;
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
    /* Las CURADAS de la plantilla (la IA no las escribe) también dicen por qué están vacías: quién las llena. La corrida
       tarda minutos y el cliente o el equipo pueden escribir mientras tanto: la data se relee ACÁ, con el bloque bajo
       candado (el mismo FOR UPDATE de la acción del cliente y de la ruta de bloques). Solo se toca el porqué. */
    for (const def of tpl.sections) {
      if (def.agentGenerated !== false || !(def.key in POR_QUE_DE_LAS_CURADAS)) continue;
      const sectionId = sectionMap.get(def.key);
      // Best-effort: el documento ya está escrito, y un aviso que no se anotó no puede dar la corrida por fallida.
      if (sectionId) {
        await anotarPorQueDeLaCurada(sectionId, def, loQueSeLeyo, opts.agentRunId ?? null).catch((e: unknown) =>
          console.warn(`[planificacion-generate] el porqué de «${def.key}» no quedó anotado:`, e instanceof Error ? e.message : e),
        );
      }
    }
    // Qué reuniones leyó esta corrida: ahora entran solas y nadie las eligió. Best-effort: el documento ya está escrito.
    if (opts.agentRunId) {
      await prisma.agentRun
        .update({ where: { id: opts.agentRunId }, data: { sourceSessionIds: material.sesionesUsadas } })
        .catch((e: unknown) => console.warn("[planificacion-generate] las reuniones leídas no quedaron en la corrida:", e instanceof Error ? e.message : e));
    }
  }
  return { canvasId, sectionCount };
}

/** Anota (o quita) el porqué de una sección curada, sobre lo que hay AHORA en la base y bajo candado. */
async function anotarPorQueDeLaCurada(sectionId: string, def: BCSectionDef, leido: LoQueSeLeyo, agentRunId: string | null): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CanvasSection" WHERE id = ${sectionId} FOR UPDATE`;
    const vivos = await tx.$queryRaw<Array<{ id: string; data: unknown }>>`
      SELECT id, data FROM "CanvasBlock" WHERE "sectionId" = ${sectionId} AND "blockType" = 'CARD' ORDER BY "order" ASC LIMIT 1 FOR UPDATE`;
    const bloque = vivos[0];
    const data = bloque?.data && typeof bloque.data === "object" && !Array.isArray(bloque.data) ? (bloque.data as object) : {};
    const razon = seccionVacia(def, data) ? porQueQuedoVacia({ key: def.key, label: def.label, agentGenerated: false }, leido) : null;
    const nueva = conPorQueVacia(data, razon);
    if (JSON.stringify(nueva) === JSON.stringify(data)) return;
    if (bloque) {
      await tx.canvasBlock.update({ where: { id: bloque.id }, data: { data: nueva as Prisma.InputJsonValue } });
      return;
    }
    await tx.canvasBlock.create({
      data: {
        sectionId,
        blockType: "CARD",
        content: null,
        data: nueva as Prisma.InputJsonValue,
        order: 0,
        source: "AGENT",
        status: "CONFIRMED",
        ...(agentRunId ? { agentRunId } : {}),
      },
    });
  });
}

/** ¿La sección está vacía? Con su regla propia (`vacia`) o la del motor, sobre el merge con su `empty`, como la pinta. */
function seccionVacia(def: BCSectionDef, data: unknown): boolean {
  const conVacios = { ...((def.empty ?? {}) as Record<string, unknown>), ...((data as Record<string, unknown>) ?? {}) };
  return def.vacia ? def.vacia(conVacios) : isBlank(conVacios);
}
