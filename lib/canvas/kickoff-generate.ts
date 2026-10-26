/**
 * lib/canvas/kickoff-generate.ts — el runner self-contained del KICKOFF (2026-10-17, fase 5 de
 * docs/nexus-sistema-de-trabajo-plan.md).
 *
 * Hasta hoy el kickoff era el único entregable que se generaba ADENTRO de app/api/clients/[id]/analyze/route.ts
 * (armaba su mensaje en la sección 10b, generaba en la 11 y persistía por el camino genérico de bloques, 13a2). Se mudó
 * acá, igual a los runners del diagnóstico, la planificación, las integraciones y la entrega, para que UNA función
 * (`generarEntregable`, lib/entregables/generar-server.ts) genere cualquier entregable y la usen el botón y el chat.
 *
 * ⚠ SIN CAMBIAR EL RESULTADO: el mensaje se arma byte a byte como en la ruta, y la persistencia es la misma (cada
 * sección de prosa que devolvió el agente se reemplaza entera por 1 CARD nacida CONFIRMED, con su corrida; las curadas
 * —equipo, horarios, canales, cierre— no viajan al modelo y no se tocan). Lo único que se suma: la plantilla elegida
 * (hoy, la de siempre) y las instrucciones de quien pide (por defecto ninguna: el mensaje queda igual).
 *
 * Las puertas siguen en la ruta y en `porQueNoSePuedeGenerar` (lib/entregables/generar-server.ts): sin handoff no hay
 * kickoff, y el permiso lo pide el artifact-gate antes de llegar acá.
 *
 * EL KICKOFF DE UN SERVICIO RECURRENTE (M1 del roadmap, 2026-10-24): con un servicio del catálogo, el mensaje ya no dice
 * «Tipo de servicio contratado: proyecto_temporal» (el `serviceType` viejo de RC Inmobiliaria) sino el servicio, su
 * cadencia, sus reuniones fijas, el ciclo en curso y su nivel de servicio (`servicioParaElKickoff`). Con la plantilla
 * «Kickoff de servicio recurrente» el documento queda con SUS secciones: las de afuera vacías se borran y las que tienen
 * algo se ocultan en el EDITOR (`ajustarElKickoffALaPlantilla`; el ojo del kickoff vive en `__ocultas` y en
 * `Project.hiddenKickoffKeys`, no en el `hidden` del Json: lib/kickoff/plantilla-del-kickoff.ts). El cliente deja de verlas
 * al «Subir», como cualquier cambio del kickoff.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { BcTemplateDef } from "@/components/landing/configs/templates.defs";
import { KICKOFF_TEMPLATE, KICKOFF_HANDOFF_KEYS } from "@/components/landing/configs/kickoff.defs";
import { generateSectionsForTemplate } from "@/lib/business-cases/canvas-agent";
import { loadHandoffContext, loadTimelineContext } from "@/lib/canvas/load-canvas-context";
import { reconcileKickoffCanvasSections } from "@/lib/canvas/default-canvases";
import { guardarVersionDelDocumento } from "@/lib/canvas/versiones";
import { syncHorariosSessionsFromHubs } from "@/lib/canvas/kickoff-hubs";
import { geometriaDeBloque } from "@/lib/canvas/agent-output-doc";
import { escalaParaPosicionar, posicionDeLaPropuesta, SECCION_DE_ESCALA } from "@/lib/escala/contexto";
import { cargarMaterialDelDocumento } from "@/lib/contexto/material-del-documento";
import { documentoConContexto } from "@/lib/contexto/documento";
import { memoriaDelDocumento } from "@/lib/memoria";
import { sanitizeTags, tagLabels, SERVICE_TO_PRODUCT } from "@/lib/tags/catalog";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { bloqueDeInstruccionesDelPedido } from "@/lib/entregables/registro";
import { KICKOFF_RECURRENTE_TEMPLATE } from "@/components/landing/configs/kickoff.defs";
import { canonDelKickoff, KICKOFF_SECCIONES_DEL_SERVICIO } from "@/lib/canvas/canvas-defs";
import { kickoffHiddenKey } from "@/components/canvas/kickoff-landing-adapter";
import { conOcultasDelBorrador, mismasOcultas, ocultasDelBorrador, ocultasEnElEditor } from "@/lib/kickoff/ocultas-del-editor";
import { conOcultasPorLaPlantilla, fueraDeLaPlantilla, ocultasPorLaPlantilla, ocultasSegunLaPlantilla } from "@/lib/kickoff/plantilla-del-kickoff";
import { resolvePipeline } from "@/lib/projects/kind";
import { servicioDelProyecto, servicioParaElKickoff } from "@/lib/servicios/catalogo";
import { esEtapaDelCiclo, ETIQUETA_DE_ETAPA } from "@/lib/servicios/ciclo";

/** Las secciones de la plantilla con que se genera; null = el canon de siempre. */
function seccionesDeLaPlantilla(template: BcTemplateDef): string[] | null {
  return template.id === KICKOFF_RECURRENTE_TEMPLATE.id ? template.sections.map((d) => d.key) : null;
}

export const MENSAJE_SIN_KICKOFF = "Este proyecto no tiene el kickoff: actívalo en el riel de la ficha y vuelve a generarlo.";
export const MENSAJE_KICKOFF_VACIO = "El agente devolvió bloques inválidos. Prueba de nuevo.";

export async function runKickoffGeneration(opts: {
  projectId: string;
  agentRunId?: string | null;
  /** La plantilla con que se genera (lib/entregables). Sin ella, la de siempre. */
  plantilla?: BcTemplateDef;
  /** Lo que pidió quien genera, para esta corrida. Sin ellas, el mensaje es el de siempre. */
  instrucciones?: string | null;
}): Promise<{ canvasId: string; sectionCount: number; salida: { sections: Array<{ key: string; blocks: Array<{ type: string; data: unknown }> }> } }> {
  const { projectId } = opts;
  const template = opts.plantilla ?? KICKOFF_TEMPLATE;
  const proyecto = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      clientId: true,
      serviceType: true,
      tags: true,
      servicioRecurrente: true,
      hubspotPipelineId: true,
      client: { select: { name: true, company: true, industry: true } },
    },
  });
  if (!proyecto) throw new Error("El proyecto no existe.");
  const clientId = proyecto.clientId;
  const companyName = proyecto.client.company ?? proyecto.client.name ?? "la empresa";
  /* El servicio recurrente manda sobre el `serviceType` (M1): un SmartLoop con `proyecto_temporal` guardado no es un
     proyecto temporal. */
  const servicio = servicioDelProyecto({
    servicioRecurrente: proyecto.servicioRecurrente,
    servicioDelPipeline: resolvePipeline(proyecto.hubspotPipelineId)?.servicioRecurrente ?? null,
  });
  const cicloAbierto = servicio?.ciclo
    ? await prisma.cicloDeProyecto
        .findFirst({ where: { projectId, estado: "abierto" }, select: { numero: true, etapa: true } })
        .catch(() => null)
    : null;
  const serviceTypeLabel = servicio ? null : (proyecto.serviceType ?? null);
  const bloqueDelServicio = servicio
    ? `${servicioParaElKickoff(
        servicio,
        cicloAbierto
          ? { numero: cicloAbierto.numero, etapa: esEtapaDelCiclo(cicloAbierto.etapa) ? ETIQUETA_DE_ETAPA[cicloAbierto.etapa] : cicloAbierto.etapa }
          : null,
      )}\n\n`
    : "";
  const secciones = seccionesDeLaPlantilla(template);

  // 9a2/9a3 de la ruta: el canvas destino, con las secciones nuevas del canon (idempotente).
  const canvas = await prisma.projectCanvas.findFirst({ where: { projectId, ...canvasOf("kickoff") }, select: { id: true } });
  if (!canvas) throw new Error(MENSAJE_SIN_KICKOFF);
  const targetCanvasId = canvas.id;
  await reconcileKickoffCanvasSections(targetCanvasId, undefined, { secciones });

  // ── 10b de la ruta: el input del agente Kickoff ─────────────────────────────────────────────────────────────────
  // El kickoff es interno: usa el handoff GENERADO aunque esté en borrador (no se exige aceptación).
  // ALLOWLIST: el kickoff lo lee el CLIENTE. Las secciones internas del handoff (riesgos_banderas, motivacion_decision
  // "por qué vendimos", acuerdos_promesas comerciales, estado_en_flight) NO se le mandan al modelo — ni siquiera para que
  // las "ignore". El prompt además se lo prohíbe, pero la fuente es el gate real.
  const handoffCtx = await loadHandoffContext(projectId, {
    onlyConfirmed: false,
    includeKeys: KICKOFF_HANDOFF_KEYS,
  });
  const timelineCtx = await loadTimelineContext(projectId);
  // Los TAGS son la fuente de los hubs del titular ("implementación de HubSpot…") y de los chips del hero; el handoff
  // aporta las integraciones por nombre (Aircall…).
  const tagsLabel = tagLabels(proyecto.tags ?? []).join(", ");
  const escalaDelKickoff = await escalaParaPosicionar(proyecto.tags ?? [], {
    titulo: "EL ESTIMADO QUE DEJÓ LA PROPUESTA (un antecedente de la venta, no una medición)",
    posicion: await posicionDeLaPropuesta(projectId),
  });
  /* El «Contexto adicional» del kickoff (2026-10-07, «el contexto adicional es de cada artefacto»): las reuniones que
     eligió el equipo (desde la etapa 7, solo esas, enteras), sus notas y sus instrucciones. El handoff sigue siendo el
     ancla; las reuniones completan lo que se acordó después (nombres, fechas, quién participa). Sin elegidas, la línea
     lo dice. Sin nada de eso —ni la memoria de abajo—, el handoff es la «ÚNICA FUENTE», como antes. */
  const materialDelKickoff = await cargarMaterialDelDocumento(projectId, documentoConContexto("kickoff")!);
  const conMaterial = !!(materialDelKickoff.reuniones || materialDelKickoff.notas);
  const reunionesDelKickoff = materialDelKickoff.reuniones
    ? `=== LAS REUNIONES ELEGIDAS POR EL EQUIPO PARA EL KICKOFF (completan el handoff: quién participa, qué se acordó después, fechas dichas por el cliente. Nada de precios, descuentos ni negociación; lo dicho [PUERTAS ADENTRO] no se le atribuye al cliente; y nada de acá agranda el alcance vendido) ===
${materialDelKickoff.reuniones}

`
    : materialDelKickoff.avisoSinReuniones
      ? `${materialDelKickoff.avisoSinReuniones}

`
      : "";
  const notasDelKickoff = materialDelKickoff.notas
    ? `=== NOTAS DEL EQUIPO PARA EL KICKOFF ===
${materialDelKickoff.notas}

`
    : "";
  /* La memoria de la cuenta y del proyecto (lib/memoria, etapa 3), con el alcance del cliente: la ficha confirmada (las
     personas, sin su postura), los procesos validados y, de las reuniones con el cliente que su material NO lee
     (`yaLeidas`), solo los acuerdos y las decisiones. Va después del handoff, que sigue siendo el ancla. Sin nada que
     decir es "" y el mensaje es el de siempre. Con memoria, el handoff deja de ser la «ÚNICA FUENTE» (es el ancla). */
  const memoriaDelKickoff = (await memoriaDelDocumento(projectId, { lector: "kickoff", clientId, yaLeidas: materialDelKickoff.sesionesUsadas })).texto;
  const bloqueDeMemoriaDelKickoff = memoriaDelKickoff
    ? `=== PARA LAS PERSONAS Y LOS ACUERDOS POSTERIORES A LA VENTA (úsalo para personas y acuerdos posteriores a la venta; nada de acá agranda el alcance vendido) ===
${memoriaDelKickoff}

`
    : "";
  // Las instrucciones de quien pide ESTA generación van primero, junto a las del documento ("" sin ellas).
  const userMessage = `${bloqueDeInstruccionesDelPedido(opts.instrucciones)}${materialDelKickoff.instrucciones}Empresa: ${companyName}
Industria: ${proyecto.client.industry ?? "No especificada"}
${serviceTypeLabel ? `Tipo de servicio contratado: ${serviceTypeLabel}\n` : ""}${servicio ? `Servicio contratado: ${servicio.nombre} (servicio recurrente)\n` : ""}${tagsLabel ? `Alcance etiquetado (tags del proyecto): ${tagsLabel}\n` : ""}
${bloqueDelServicio}=== HANDOFF DEL PROYECTO (${conMaterial || memoriaDelKickoff ? "TU FUENTE ANCLA" : "ESTA ES TU ÚNICA FUENTE"}) ===
${handoffCtx || "(Sin handoff todavía. Dejá vacías las secciones sin respaldo; no inventes contenido.)"}

${bloqueDeMemoriaDelKickoff}${reunionesDelKickoff}${notasDelKickoff}${timelineCtx ? `${timelineCtx}\n\n` : ""}${escalaDelKickoff.texto}
${materialDelKickoff.cierreDeFrontera ? `\n${materialDelKickoff.cierreDeFrontera}\n` : ""}
Generá la landing de kickoff de cara al cliente siguiendo tus instrucciones: es una PRESENTACIÓN (poco texto, cards con título corto y detalle de una línea), tono post-venta, sin inflar alcance/objetivos (solo lo respaldado por el handoff), métricas como propuesta de Smarteam si no están explícitas, y NO reproduzcas el cronograma en prosa (la plantilla lo muestra aparte).`;

  // ── 11 de la ruta: generación TIPADA (motor de secciones) ───────────────────────────────────────────────────────
  // CARRY-FORWARD (load-bearing): la generación sobreescribe los bloques EN EL LUGAR (borra y recrea). Sin pasar la data
  // previa, `coerceToSchema` dejaría solo las keys del schema y se perderían `hero.coverImageUrl`, `hero.brands` y
  // `hero.eyebrow` — todo lo que cura el CSE y el agente nunca genera. (El `compara` legacy de la prosa NO se purga acá:
  // la de-duplicación la hace el render, `buildKickoffSections`.)
  const prevDataByKey: Record<string, unknown> = {};
  const prevSecs = await prisma.canvasSection.findMany({
    where: { canvasId: targetCanvasId },
    select: { key: true, blocks: { where: { blockType: "CARD" }, select: { data: true }, take: 1 } },
  });
  for (const s of prevSecs) {
    const d = s.blocks[0]?.data;
    if (d && typeof d === "object") prevDataByKey[s.key] = d;
  }
  const sinEscala = !escalaDelKickoff.usa;
  const gen = await generateSectionsForTemplate(
    template,
    userMessage,
    undefined,
    sinEscala ? new Set([SECCION_DE_ESCALA.kickoff]) : undefined,
    prevDataByKey,
  );
  // La foto del kickoff ANTES de tocar nada (lib/canvas/versiones.ts): acá la IA ya respondió, y lo de abajo —vaciar la
  // Escala, sincronizar horarios, reescribir bloques— ya cambia el documento.
  await guardarVersionDelDocumento(targetCanvasId, { origen: "Antes de regenerar" });
  /* La persistencia de abajo solo reescribe las secciones que el agente devolvió: la de la Escala, salteada con el trato
     «Sin Escala», conservaría lo de una corrida anterior. Se vacía acá — un kickoff sin Escala que muestra niveles se
     contradice solo. */
  if (sinEscala) {
    await prisma.canvasBlock.deleteMany({ where: { section: { canvasId: targetCanvasId, key: SECCION_DE_ESCALA.kickoff } } });
  }
  /* Q2 (2026-10-27): todo kickoff que se genera trae la tarjeta fija del acceso al portal arriba de «Lo que necesitamos de
     tu equipo» (`acceso`, fuera del esquema). Lo que el CSE ya ajustó viene de la corrida anterior y no se toca. */
  for (const s of gen.sections) {
    if (s.key !== "tu_rol" || !s.data || typeof s.data !== "object") continue;
    const d = s.data as Record<string, unknown>;
    if (!d.acceso || typeof d.acceso !== "object") s.data = { ...d, acceso: { desde: new Date().toISOString() } };
  }
  const salida = { sections: gen.sections.map((s) => ({ key: s.key, blocks: [{ type: "card", data: s.data as unknown }] })) };
  // Auto-poblar las sesiones de "horarios" desde los hubs del handoff. Best-effort; preserva lo previo.
  await syncHorariosSessionsFromHubs(targetCanvasId, proyecto.tags);

  // La validación de la ruta (paso 11): sin secciones, la corrida falla con el mismo mensaje.
  if (!salida.sections.length) throw new Error(MENSAJE_KICKOFF_VACIO);

  // ── 12 de la ruta: la salida de la corrida (la lee el visor del historial para pintar la corrida como se vio) ─────
  if (opts.agentRunId) {
    await prisma.agentRun
      .update({ where: { id: opts.agentRunId }, data: { output: JSON.stringify(salida), sourceSessionIds: [], serviceType: proyecto.serviceType ?? null } })
      .catch(() => {});
  }

  // ── 13a2 de la ruta: los bloques. Cada sección de prosa se reemplaza ENTERA por 1 CARD nacida CONFIRMED ────────────
  // (regenerar = prosa fresca, sin el doble bloque AGENT + MODIFIED viejo). Las curadas no están en la salida → intactas.
  const dbSections = await prisma.canvasSection.findMany({ where: { canvasId: targetCanvasId }, select: { id: true, key: true } });
  const sectionMap = new Map(dbSections.map((s) => [s.key, s.id]));
  let sectionCount = 0;
  for (const section of salida.sections) {
    const sectionId = sectionMap.get(section.key);
    if (!sectionId || !section.blocks?.length) continue;
    const blockData: Prisma.CanvasBlockCreateManyInput[] = section.blocks.map((block, i) => {
      const g = geometriaDeBloque(block);
      return {
        sectionId,
        blockType: g.blockType as "TEXT" | "HEADING" | "TABLE" | "METRIC" | "CALLOUT" | "CARD" | "FLOWCHART" | "CHART" | "IMAGE",
        content: g.content,
        data: g.data as Prisma.InputJsonValue | undefined,
        order: i,
        colSpan: g.colSpan,
        rowSpan: g.rowSpan,
        source: "AGENT" as const,
        status: "CONFIRMED",
        agentRunId: opts.agentRunId ?? null,
      };
    });
    await prisma.$transaction([prisma.canvasBlock.deleteMany({ where: { sectionId } }), prisma.canvasBlock.createMany({ data: blockData })]);
    sectionCount++;
  }

  /* El documento queda con las secciones de su plantilla (M1): de la de siempre a la del servicio y de vuelta. Las de
     afuera vacías se borran; con algo, se ocultan (nada se pierde). Solo si la generación escribió algo. */
  if (sectionCount > 0) {
    await ajustarElKickoffALaPlantilla(projectId, targetCanvasId, secciones).catch((e) =>
      console.warn("[kickoff] no se ajustó a la plantilla:", e instanceof Error ? e.message : e),
    );
  }

  // ── 14 de la ruta: la clasificación del proyecto (lo que `persistTimelineFromAgentOutput` hacía con la salida del
  // kickoff, que no trae etiquetas): suma el producto del servicio contratado si falta y deja la fila saneada.
  await asegurarEtiquetaDelServicio(projectId).catch((e) => console.warn("[kickoff] tags no guardados:", e instanceof Error ? e.message : e));

  return { canvasId: targetCanvasId, sectionCount, salida };
}

/**
 * EL KICKOFF QUEDA CON LAS SECCIONES DE SU PLANTILLA (M1, 2026-10-25). Las del canon (el de siempre más las del servicio)
 * que la plantilla no tiene: vacías, se borran; con algo, se ocultan en el editor. Las de la plantilla que había ocultado
 * otra plantilla vuelven a verse. Las creadas por una persona (`custom:*`) no se tocan. Nada cambia para el cliente hasta
 * que alguien toca «Subir».
 */
async function ajustarElKickoffALaPlantilla(projectId: string, canvasId: string, secciones: readonly string[] | null): Promise<void> {
  const deLaPlantilla = new Set(canonDelKickoff(secciones).map((s) => s.key));
  const delCanon = new Set([...canonDelKickoff(null), ...KICKOFF_SECCIONES_DEL_SERVICIO].map((s) => s.key));
  const filas = await prisma.canvasSection.findMany({
    where: { canvasId },
    select: { id: true, key: true, _count: { select: { blocks: true } } },
  });
  // Las ctx (cronograma, procesos) no tienen bloques pero muestran lo del proyecto: cuentan como «con algo».
  const { borrar: vacias, ocultar } = fueraDeLaPlantilla(
    filas.map((s) => ({ id: s.id, key: s.key, bloques: s._count.blocks, ctx: kickoffHiddenKey(s.key, s.id) === s.key })),
    deLaPlantilla,
    delCanon,
  );
  await prisma.$transaction(async (tx) => {
    if (vacias.length) await tx.canvasSection.deleteMany({ where: { id: { in: vacias.map((s) => s.id) } } });
    // FOR UPDATE: el Json lo escriben también el ojo del kickoff, los briefs y la plantilla anotada.
    await tx.$queryRaw`SELECT id FROM "ProjectCanvas" WHERE id = ${canvasId} FOR UPDATE`;
    const [c, p] = await Promise.all([
      tx.projectCanvas.findUnique({ where: { id: canvasId }, select: { sections: true } }),
      tx.project.findUnique({ where: { id: projectId }, select: { hiddenKickoffKeys: true } }),
    ]);
    const publicadas = p?.hiddenKickoffKeys ?? [];
    const { ocultas, porLaPlantilla } = ocultasSegunLaPlantilla({
      ocultasDelEditor: ocultasEnElEditor(publicadas, ocultasDelBorrador(c?.sections)),
      porLaPlantillaAntes: ocultasPorLaPlantilla(c?.sections),
      fueraConAlgo: ocultar.map((s) => ({ key: s.key, claveDelOjo: kickoffHiddenKey(s.key, s.id) })),
      adentro: filas.filter((s) => deLaPlantilla.has(s.key)).map((s) => ({ key: s.key, claveDelOjo: kickoffHiddenKey(s.key, s.id) })),
    });
    // Las entradas del Json de las secciones borradas se van (así no aparecen en el índice del panel).
    const borradas = new Set(vacias.map((s) => s.key));
    const sinLasBorradas = (Array.isArray(c?.sections) ? (c!.sections as unknown[]) : []).filter(
      (x) => !(x && typeof x === "object" && borradas.has(String((x as { key?: unknown }).key))),
    );
    const borrador = mismasOcultas(ocultas, publicadas) ? null : ocultas;
    const json = conOcultasPorLaPlantilla(conOcultasDelBorrador(sinLasBorradas, borrador, "plantilla", new Date().toISOString()), porLaPlantilla);
    await tx.projectCanvas.update({ where: { id: canvasId }, data: { sections: json as object[] } });
  });
}

async function asegurarEtiquetaDelServicio(projectId: string): Promise<void> {
  const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { tags: true, serviceType: true } });
  const next = sanitizeTags(proj?.tags ?? []);
  const producto = proj?.serviceType ? SERVICE_TO_PRODUCT[proj.serviceType] : undefined;
  if (producto && !next.includes(producto)) next.push(producto);
  const saneado = sanitizeTags(next);
  if (JSON.stringify(saneado) !== JSON.stringify(proj?.tags ?? [])) {
    await prisma.project.update({ where: { id: projectId }, data: { tags: saneado } });
  }
}
