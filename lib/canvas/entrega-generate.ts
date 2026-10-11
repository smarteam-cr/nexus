/**
 * lib/canvas/entrega-generate.ts
 *
 * Runner del canvas "Entrega" — el documento con el que se cierra un proyecto.
 *
 * ── LA SEPARACIÓN QUE DEFINE ESTE ARCHIVO ────────────────────────────────────
 * Corre DOS escrituras que nunca se mezclan:
 *
 *   1. Las siete secciones de PROSA las escribe el agente, con el handoff y las sesiones
 *      como fuente. Ahí puede equivocarse de tono o de énfasis, y el CSE lo corrige.
 *   2. Las dos secciones con CIFRAS —«El plan, cumplido» y «Qué queda abierto»— las escribe
 *      ESTE archivo desde el cronograma, con `lib/delivery/claims.ts`. **El agente ni las
 *      ve**: no están en el template que se le manda.
 *   2b. El desafío y los objetivos del DIAGNÓSTICO (2026-10-07): la IA los recibe y dice cómo
 *      quedó cada uno, pero la lista y los títulos los pone este archivo (lib/delivery/objetivos.ts):
 *      la IA no puede inventar un objetivo, y sin diagnóstico «El desafío que resolvimos» se apaga.
 *   3. «Tu posición en la Escala» (2026-09-12) — el punto de partida que midió el Diagnóstico,
 *      la meta y la ventana de remedición (`lib/escala/posicion.ts`). Tampoco la ve el agente:
 *      el nivel nuevo no se declara el día de la entrega.
 *
 * No es una optimización: es la única promesa de honestidad del documento. Un modelo que
 * escribe «se completó el 100% del plan» en el papel que el cliente archiva no tiene quién
 * lo contradiga. Acá no puede, porque nunca se le pregunta.
 *
 * ⚠ Y por eso los números se escriben DESPUÉS de la generación: si el agente devolviera algo
 * para esas keys —no puede, pero si el template cambiara— este paso lo pisa igual.
 */
import { prisma } from "@/lib/db/prisma";
import { guardarVersionDelDocumento } from "@/lib/canvas/versiones";
import { Prisma } from "@prisma/client";
import { ENTREGA_CANVAS, entregaSectionSequence } from "@/lib/canvas/canvas-defs";
import { createOnDemandCanvas, reconcileOnDemandCanvasSections } from "@/lib/canvas/default-canvases";
import { loadCanvasContext, loadHandoffContext } from "@/lib/canvas/load-canvas-context";
import { serializeProcesosForPrompt } from "@/lib/canvas/read-procesos";
import { generateSectionsForTemplate } from "@/lib/business-cases/canvas-agent";
import { ENTREGA_TEMPLATE, ENTREGA_HANDOFF_KEYS } from "@/components/landing/configs/entrega.defs";
import { tagLabels, usaEscala } from "@/lib/tags/catalog";
import { posicionDelDiagnostico } from "@/lib/escala/contexto";
import { posicionParaLaEntrega } from "@/lib/escala/posicion";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { getProjectMemberSessions } from "@/lib/sessions/project-sources";
import { cargarMaterialDelDocumento } from "@/lib/contexto/material-del-documento";
import { documentoConContexto } from "@/lib/contexto/documento";
import { memoriaDelDocumento } from "@/lib/memoria";
import { loadProjectSummary } from "@/lib/portfolio/load";
import { summarizeParticularidades } from "@/lib/timeline/particularidades-summary";
import { resultadosDelProyecto } from "@/lib/handoff/resultados";
import { resultadosParaPrompt } from "@/lib/handoff/resultados-medibles";
import {
  diagnosticoParaLaEntrega,
  leerDesafioDelDiagnostico,
  leerObjetivosDelDiagnostico,
  normalizarObjetivosPropuestos,
  type DesafioDelDiagnostico,
  type ObjetivoDelDiagnostico,
} from "@/lib/delivery/objetivos";
import {
  buildDeliveryClaims,
  metricasDeCumplimiento,
  pendientesAbiertos,
  type FaseParaEntrega,
} from "@/lib/delivery/claims";

/** Asegura el canvas "Entrega" + reconcilia. Idempotente. */
export async function ensureEntregaCanvas(projectId: string): Promise<string> {
  const existing = await prisma.projectCanvas.findFirst({
    where: canvasOfNested(ENTREGA_CANVAS.slug, { projectId }),
    select: { id: true },
  });
  const canvasId = existing?.id ?? (await createOnDemandCanvas(projectId, ENTREGA_CANVAS));
  await reconcileOnDemandCanvasSections(canvasId, ENTREGA_CANVAS, entregaSectionSequence);
  return canvasId;
}

/** Las claves que el agente NO escribe. Se derivan del template, no se transcriben. */
const KEYS_DERIVADAS = new Set(
  ENTREGA_TEMPLATE.sections.filter((d) => d.agentGenerated === false && d.key !== "cierre").map((d) => d.key),
);

/**
 * El desafío y los objetivos del Diagnóstico del proyecto, tal como están escritos. El Diagnóstico
 * es un documento de cara al cliente, así que nada de esto es interno.
 */
async function desafioYObjetivosDelDiagnostico(
  projectId: string,
): Promise<{ desafio: DesafioDelDiagnostico | null; objetivos: ObjetivoDelDiagnostico[] }> {
  const bloques = await prisma.canvasBlock.findMany({
    where: {
      blockType: "CARD",
      section: { key: { in: ["desafio", "objetivos"] }, canvas: canvasOfNested("diagnosis", { projectId }) },
    },
    orderBy: { order: "asc" },
    select: { data: true, section: { select: { key: true } } },
  });
  const deLa = (key: string) => bloques.find((b) => b.section.key === key)?.data;
  return { desafio: leerDesafioDelDiagnostico(deLa("desafio")), objetivos: leerObjetivosDelDiagnostico(deLa("objetivos")) };
}

/*
 * LAS REUNIONES (2026-10-07): las del «Contexto adicional» de la Entrega, por el mismo cargador que
 * el diagnóstico (lib/contexto/material-del-documento.ts). Antes eran las últimas reuniones de TODOS
 * los vínculos del proyecto, también las de puertas adentro y sin decir de qué sala eran, en un
 * documento que abre el cliente. Desde el 2026-10-07 entraban las reuniones con el cliente que nadie
 * sacó; desde la etapa 7 de la memoria de la cuenta, SOLO las que eligió el equipo, enteras, cada una
 * con su sala, y el CSE ve en la pantalla cuáles son. Sin elegidas, la memoria lleva el peso.
 */

/** Genera (o regenera) el documento de entrega. */
export async function runEntregaGeneration(opts: {
  projectId: string;
  agentRunId?: string | null;
  canvasId?: string;
}): Promise<{ canvasId: string; sectionCount: number }> {
  const { projectId } = opts;

  const [canvasId, handoffCtx, kickoffCtx, desarrolloCtx, project, summary] = await Promise.all([
    opts.canvasId ?? ensureEntregaCanvas(projectId),
    /* ⛔ CON ALLOWLIST: la Entrega la abre el cliente. Ver `ENTREGA_HANDOFF_KEYS` para qué
       entra y qué no, con el daño de cada exclusion escrito. El kickoff y el requerimiento
       tecnico que se leen abajo NO la necesitan: los dos son de cara al cliente, asi que su
       contenido ya paso por este filtro cuando se genero. */
    loadHandoffContext(projectId, { onlyConfirmed: false, includeKeys: ENTREGA_HANDOFF_KEYS }),
    loadCanvasContext(projectId, "kickoff", { onlyConfirmed: false }),
    loadCanvasContext(projectId, "tech-requirements", { onlyConfirmed: false }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        name: true,
        tags: true,
        clientId: true,
        client: { select: { name: true, company: true, industry: true } },
        timeline: {
          select: {
            anchorStartDate: true,
            closeDateOverride: true,
            phases: {
              orderBy: { order: "asc" },
              select: {
                name: true,
                status: true,
                durationWeeks: true,
                startWeek: true,
                tasks: { select: { title: true, status: true, party: true } },
              },
            },
            /* D-09: las desviaciones que el CSE curó como visibles al cliente, con el MISMO gate
               por registro que el chokepoint de la vista externa (lib/external/timeline-view.ts):
               visibles Y confirmadas. Solo lo que suma el atraso; la cita interna nunca se pide. */
            particularidades: {
              where: { visibleExternal: true, needsValidation: false },
              select: { kind: true, party: true, weeksImpact: true, estado: true },
            },
          },
        },
      },
    }),
    loadProjectSummary(projectId).catch(() => null),
  ]);

  const [procesosCtx, material, miembros, delDiagnostico, resultados] = await Promise.all([
    project?.clientId ? serializeProcesosForPrompt(project.clientId, { onlyConfirmed: false }) : Promise.resolve(""),
    cargarMaterialDelDocumento(projectId, documentoConContexto("delivery")!),
    /* La cifra «Reuniones de trabajo» que ve el cliente sigue saliendo de la membresía del proyecto,
       como siempre (lib/delivery/claims.ts): el «Contexto adicional» decide qué LEE el agente, no
       cuántas reuniones tuvo el proyecto. */
    getProjectMemberSessions(projectId),
    desafioYObjetivosDelDiagnostico(projectId),
    resultadosDelProyecto(projectId).catch(() => null),
  ]);
  const r = material.resumen;
  /* La memoria de la cuenta y del proyecto (lib/memoria, etapa 3), con el alcance del CLIENTE (la entrega la abre el
     cliente): la ficha confirmada y, de las reuniones con el cliente que su material no lee, los acuerdos y las
     decisiones. Sin procesos, historia, resultados ni desviaciones: ya los lee, o traen las cifras del proyecto que
     escribe Nexus (lib/memoria/consumidores.ts › delivery). */
  const memoria = await memoriaDelDocumento(projectId, {
    lector: "delivery",
    clientId: project?.clientId ?? null,
    yaLeidas: material.sesionesUsadas,
  });
  const bloqueDelDiagnostico = diagnosticoParaLaEntrega(delDiagnostico);
  const bloqueDeResultados = resultadosParaPrompt(resultados?.resultados ?? []);

  const companyName = project?.client?.name ?? project?.client?.company ?? "el cliente";
  const hubs = tagLabels(project?.tags ?? []);

  const userMessage = [
    // Las «Instrucciones adicionales» de la Entrega (2026-10-07): primero, porque mandan sobre todo.
    material.instrucciones,
    `Empresa: ${companyName}`,
    `Proyecto: ${project?.name ?? "(sin nombre)"}`,
    project?.client?.industry ? `Industria: ${project.client.industry}` : "",
    hubs.length ? `Alcance vendido (tags): ${hubs.join(", ")}` : "",
    "",
    "=== HANDOFF — TU FUENTE ANCLA (qué se vendió y qué le dolía) ===",
    handoffCtx || "(Sin handoff generado. Derivá el arco de las sesiones, con mucha más cautela.)",
    kickoffCtx ? `\n=== KICKOFF (lo que se le prometió al arrancar) ===\n${kickoffCtx}` : "",
    desarrolloCtx ? `\n=== REQUERIMIENTO TÉCNICO (lo que se construyó a medida) ===\n${desarrolloCtx}` : "",
    procesosCtx ? `\n=== PROCESOS DEL CLIENTE ===\n${procesosCtx}` : "",
    bloqueDelDiagnostico
      ? `\n=== DIAGNÓSTICO — EL DESAFÍO Y LOS OBJETIVOS QUE SE LE PRESENTARON AL CLIENTE ===\n${bloqueDelDiagnostico}`
      : "\n=== SIN DIAGNÓSTICO ===\nEl proyecto no tiene desafío ni objetivos en un diagnóstico: «El desafío que resolvimos» va vacío y los objetivos salen de los resultados del handoff.",
    bloqueDeResultados ? `\n=== RESULTADOS MEDIBLES DEL HANDOFF (línea base y meta) ===\n${bloqueDeResultados}` : "",
    /* La COBERTURA va explícita. Un agente que ve 4 reuniones sin saber que hay 61 más que no
       se pudieron leer concluye con una confianza que el material no respalda — y en un cierre
       eso se traduce en afirmar que algo «no pasó» cuando simplemente no quedó escrito.
       En Wherex son 4 con contenido sobre 65. */
    material.reuniones
      ? `\n=== LAS REUNIONES ELEGIDAS POR EL EQUIPO (lo que pasó de verdad, con su minuta y lo que se dijo, salvo las marcadas «en resumen»; lo dicho [PUERTAS ADENTRO] no se le atribuye al cliente) ===\n` +
        `Cobertura: ${r.leidas} reuniones con contenido, de ${r.ocurridas} elegidas que ya ocurrieron. ` +
        `Las demás no tienen transcripción ni minuta guardada, o no cupieron, y el proyecto tuvo otras que nadie eligió — ` +
        `eso NO significa que no hayan ocurrido, así que no concluyas nada de su ausencia.\n\n` +
        material.reuniones
      : `\n${material.avisoSinReuniones || "=== SIN REUNIONES CON TRANSCRIPCIÓN ==="}\nSin transcripciones no hay citas: no inventes citas ni números del negocio del cliente — la sección de impacto va vacía. No concluyas nada de la falta de reuniones.`,
    material.notas ? `\n=== NOTAS DEL EQUIPO PARA LA ENTREGA ===\n${material.notas}` : "",
    memoria.texto ? `\n${memoria.texto}` : "",
    // La regla otra vez, antes del recordatorio final: el bloque de reuniones puede ser largo.
    material.cierreDeFrontera ? `\n${material.cierreDeFrontera}` : "",
    "",
    /* El recordatorio va al FINAL además de estar en el prompt del sistema: es la instrucción
       que más cuesta que se respete, porque escribir «logramos completar el 100%» es el reflejo
       natural al redactar un cierre. */
    "RECORDATORIO: no escribas NINGÚN número del proyecto (tareas, fases, semanas, fechas, porcentajes). " +
      "Esos los calcula Nexus y van en su propia sección. Los únicos números permitidos son los del NEGOCIO DEL CLIENTE " +
      "que alguien haya dicho en una reunión, y van con su cita textual en la sección de impacto.",
  ]
    .filter((x) => x !== "")
    .join("\n");

  const prevSecs = await prisma.canvasSection.findMany({
    where: { canvasId },
    select: { id: true, key: true, blocks: { where: { blockType: "CARD" }, select: { data: true }, take: 1 } },
  });
  const prevDataByKey: Record<string, unknown> = {};
  for (const s of prevSecs) {
    const d = s.blocks[0]?.data;
    if (d && typeof d === "object") prevDataByKey[s.key] = d;
  }

  const gen = await generateSectionsForTemplate(ENTREGA_TEMPLATE, userMessage, undefined, undefined, prevDataByKey);

  // La foto ANTES de escribir (lib/canvas/versiones.ts): la IA ya respondió y todavía no se tocó nada.
  await guardarVersionDelDocumento(canvasId, { origen: "Antes de regenerar" });

  const sectionMap = new Map(prevSecs.map((s) => [s.key, s.id]));
  const escribir = async (key: string, data: unknown) => {
    const sectionId = sectionMap.get(key);
    if (!sectionId) return false;
    await prisma.$transaction([
      prisma.canvasBlock.deleteMany({ where: { sectionId } }),
      prisma.canvasBlock.create({
        data: {
          sectionId,
          blockType: "CARD",
          content: null,
          data: (data ?? {}) as Prisma.InputJsonValue,
          order: 0,
          source: "AGENT",
          status: "CONFIRMED",
          ...(opts.agentRunId ? { agentRunId: opts.agentRunId } : {}),
        },
      }),
    ]);
    return true;
  };

  /* El desafío y los objetivos: la lista la pone el Diagnóstico, no la IA (lib/delivery/objetivos.ts).
     Sin desafío en el diagnóstico, la sección se escribe vacía y se apaga sola. */
  const acomodar = (key: string, data: unknown): unknown => {
    if (key === "desafio_resuelto" && !delDiagnostico.desafio) return { intro: "", items: [] };
    if (key !== "logros") return data;
    const d = { ...((data ?? {}) as Record<string, unknown>) };
    delete d.items; // las capacidades en prosa de antes: el formato nuevo las reemplaza
    const previo = (prevDataByKey.logros ?? {}) as Record<string, unknown>;
    return {
      ...d,
      objetivosPropuestos: normalizarObjetivosPropuestos({
        delDiagnostico: delDiagnostico.objetivos,
        delAgente: d.objetivosPropuestos,
        confirmados: previo.objetivosConfirmados,
      }),
      objetivosConfirmados: Array.isArray(previo.objetivosConfirmados) ? previo.objetivosConfirmados : [],
    };
  };

  let sectionCount = 0;
  const escritas = new Set<string>();
  for (const s of gen.sections) {
    // Cinturón: si el template cambiara y le mandara una key derivada al modelo, se descarta.
    if (KEYS_DERIVADAS.has(s.key)) continue;
    if (await escribir(s.key, acomodar(s.key, s.data))) {
      sectionCount++;
      escritas.add(s.key);
    }
  }
  // Si la IA no devolvió los objetivos, igual quedan los del diagnóstico, «por medir».
  if (!escritas.has("logros") && delDiagnostico.objetivos.length) {
    if (await escribir("logros", acomodar("logros", { intro: "", objetivosPropuestos: [] }))) sectionCount++;
  }

  // ── Las cifras, desde el cronograma. El agente no participa ──────────────────
  const fases: FaseParaEntrega[] = (project?.timeline?.phases ?? []).map((f) => ({
    name: f.name,
    status: f.status,
    durationWeeks: f.durationWeeks,
    startWeek: f.startWeek,
    tasks: f.tasks.map((t) => ({ title: t.title, status: t.status, party: t.party })),
  }));

  const claims = buildDeliveryClaims({
    fases,
    anchorStartDate: project?.timeline?.anchorStartDate?.toISOString() ?? null,
    closeDateOverride: project?.timeline?.closeDateOverride?.toISOString() ?? null,
    closing: summary?.closing ?? { projectedISO: null, promisedISO: null, driftDays: null },
    reuniones: miembros.sessions.length,
    /* D-09: el atraso atribuido, sumado por el ÚNICO sumador del repo (solo kind ATRASO; incluye
       las cerradas a propósito: el calendario ya se movió). `buildDeliveryClaims` lo anula si
       da 0. Y la foto del plan: cuánto se sumó a lo prometido. */
    corrimiento: summarizeParticularidades(project?.timeline?.particularidades ?? []),
    alcance: summary?.scope ?? null,
    hubs,
  });

  /* Con `metrics: []` la sección se apaga sola en lectura y en PDF (`isBlank`). Es lo que hace
     que un proyecto sin ancla, o con el cronograma nunca marcado, no diga «0%» — dice nada. */
  if (await escribir("cumplimiento", { metrics: metricasDeCumplimiento(claims) })) sectionCount++;

  const pendientes = pendientesAbiertos(fases);
  if (
    await escribir("pendientes", {
      intro: pendientes.length ? "Lo que queda en marcha después de esta entrega:" : "",
      items: pendientes,
    })
  )
    sectionCount++;

  /* La Escala: el punto de partida que midió el Diagnóstico, la meta y cuándo se vuelve a medir.
     Se reescribe en cada corrida, como las cifras. Sin Escala, o sin un diagnóstico que haya ubicado
     alguna área en 5.2, queda vacía y se apaga sola — nunca «no se midió» con un casillero en blanco. */
  const partida = usaEscala(project?.tags ?? []) ? await posicionDelDiagnostico(projectId) : null;
  const fechaDeEntrega =
    project?.timeline?.closeDateOverride ??
    (summary?.closing?.projectedISO ? new Date(summary.closing.projectedISO) : new Date());
  if (await escribir("escala", posicionParaLaEntrega(partida, fechaDeEntrega))) sectionCount++;

  return { canvasId, sectionCount };
}
