/**
 * lib/projects/project-brief.ts — «CÓMO VA ESTE PROYECTO», EN AFIRMACIONES CON FUENTE.
 *
 * Espejo de `lib/cs/account-brief.ts` un nivel más abajo: aquél responde «cómo va la CUENTA»,
 * éste «cómo va ESTE proyecto» — la pregunta que el CSE se hace todos los días y que hoy solo se
 * contesta abriendo cinco pestañas.
 *
 * ── LO QUE NO SE RE-IMPLEMENTA ───────────────────────────────────────────────
 * Ni la validación de citas (`lib/cs/brief-citas.ts`), ni el armado del contexto
 * (`brief-fuentes.ts`), ni la llamada al modelo con su reintento por truncado (`brief-llm.ts`).
 * Los tres son compartidos a propósito: dos copias de «descartá lo que no tenga fuente» divergen
 * calladas, y la que se relaje deja pasar afirmaciones inventadas en UN documento mientras el
 * otro sigue estricto, sin que nada lo señale.
 *
 * ── LAS DOS GARANTÍAS DEL MOLDE, CONSERVADAS ─────────────────────────────────
 * 1. El `AgentRun` se crea ANTES de leer el contexto: cualquier falla posterior queda con su
 *    causa en `AgentRun.output`, auditable, nunca un fallo mudo.
 * 2. Una afirmación cuya cita no está en el contexto se descarta. Sin fuente no hay afirmación.
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { parsearBriefCitado } from "@/lib/cs/brief-citas";
import { generarTextoDeBrief } from "@/lib/cs/brief-llm";
import { bloqueDeOperativa } from "@/lib/cs/hubspot-ops-block";
import { fetchTranscriptContent } from "@/lib/sessions/transcript";
import { etiquetaDeSala } from "@/lib/sessions/etiqueta-de-sala";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { getSessionCategories } from "@/lib/cache/session-categories";
import { loadHandoffContext } from "@/lib/canvas/load-canvas-context";
import { armarContextoDeBrief, type DatosDeBrief } from "./brief-fuentes";

const AGENT_ID = "agent-project-brief";
const AGENT_SLUG = "project-brief";

/** Cuántas reuniones se miran. Las más recientes: un resumen es del estado ACTUAL. */
const MAX_SESIONES = 12;
/** Y cuántas desviaciones del cronograma. */
const MAX_DESVIACIONES = 10;

export type ProjectBriefResult =
  | { status: "ok"; runId: string; statements: number; discarded: number }
  | { status: "skipped"; reason: "agent_not_seeded" | "no_project" | "sin_material"; runId?: string }
  | { status: "error"; runId: string; error: string };

/**
 * Junta lo que se puede citar de un proyecto.
 *
 * Devuelve `null` si el proyecto no existe. El material puede venir vacío y eso NO es un error:
 * el llamador lo distingue y corta antes de pagar la llamada al modelo.
 */
async function cargarDatos(projectId: string): Promise<DatosDeBrief | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      client: { select: { name: true } },
      hubspotStatus: true,
      hubspotPriority: true,
      hubspotBlockReason: true,
      hubspotBlockDetail: true,
      hubspotAdoptionState: true,
      hubspotPipelineStageLabel: true,
      hubspotStageSyncedAt: true,
      handoff: { select: { updatedAt: true } },
    },
  });
  if (!p) return null;

  /* ⚠ La cobertura se mide sobre TODO el proyecto, no sobre `MAX_SESIONES`. El conteo viejo salía
     de la ventana de 12 y el texto decía «de este proyecto»: en Wherex daba 8 cuando eran 25 sobre
     65. Son dos counts indexados (`projects` + `date`), no traen filas: mucho más barato que
     `fetchTranscriptContent` sobre el historial entero.
     «Sin registro» = ni transcripción ni minuta, que es EXACTAMENTE lo que hace que
     `fetchTranscriptContent` devuelva null — el mismo criterio con el que una reunión se queda
     afuera de las fuentes citables, medido en la base en vez de fila por fila. */
  const ocurridas = { projects: { some: { projectId } }, date: { lte: new Date() } } as const;

  const [sesiones, desviaciones, categorias, handoffTexto, totalOcurridas, sinRegistro] =
    await Promise.all([
    prisma.firefliesSession.findMany({
      /* ⚠ SOLO LAS QUE YA OCURRIERON. Las más recientes incluían las AGENDADAS —hay 459 sesiones
         futuras en el corpus por la agenda recurrente de Google—, así que el resumen se armaba
         gastando su cupo en reuniones que todavía no pasaron. Sin transcripción no aportaban nada
         y encima desplazaban a las reales. */
      where: ocurridas,
      orderBy: { date: "desc" },
      take: MAX_SESIONES,
      /* `participants` y `organizerEmail` son para la ETIQUETA DE SALA (Tanda 3): «lo dijo el
         cliente» y «lo dijimos nosotros» no pesan igual, y sin eso el modelo no los distingue. */
      select: {
        id: true,
        title: true,
        date: true,
        participants: true,
        organizerEmail: true,
      },
    }),
    prisma.particularidad.findMany({
      where: { timeline: { projectId } },
      orderBy: { lastDetectedAt: "desc" },
      take: MAX_DESVIACIONES,
      select: { id: true, kind: true, title: true, detail: true, lastDetectedAt: true },
    }),
    getSessionCategories(),
    /* ⚠ EL DOCUMENTO QUE DICE QUÉ SE PROMETIÓ. Sin él, «cómo va el proyecto» se contesta contra
       nada: una desviación es una desviación RESPECTO DE ALGO, y ese algo vive acá.
       `onlyConfirmed: true` a propósito —igual que el agente de avance y que `contexto/cargar`—:
       un brief que cita el handoff tiene que citar lo que un humano validó, no un borrador del
       agente esperando revisión.
       ⛔ Y va por `loadHandoffContext`, nunca por `loadCanvasContext(x, "handoff")`: el embudo
       resuelve de quién ES el handoff y mete la procedencia adentro del texto — hay una guarda
       en `lib/handoff/duenio.test.ts` que lo hace cumplir.
       El largo no hace falta acotarlo acá: `armarContextoDeBrief` capea cada bloque. */
    loadHandoffContext(projectId, { onlyConfirmed: true }),
    prisma.firefliesSession.count({ where: ocurridas }),
    prisma.firefliesSession.count({
      where: { ...ocurridas, transcript: null, summary: { equals: Prisma.DbNull } },
    }),
    ]);

  /* El contenido lo serializa el helper compartido: sabe leer los DOS shapes de resumen
     (Fireflies y Gemini Notes) y prioriza el resumen sobre el transcript crudo. Re-implementarlo
     acá habría vuelto a tropezar con el `action_items` que en un shape es string y en el otro
     array — el bug que ese archivo documenta. */
  const dominiosPropios = buildInternalDomainsSet(categorias);
  const contenidos = await Promise.all(
    sesiones.map((s) => fetchTranscriptContent(s.id, s.title)),
  );

  return {
    projectName: p.name,
    clientName: p.client?.name ?? "sin cliente",
    /* `bloqueDeOperativa` devuelve "" cuando no hay nada cargado, y el armador omite los bloques
       vacíos de los DOS lados — así un proyecto sin operativa no gana una fuente hueca. */
    operativa: bloqueDeOperativa(p, { incluirRotulo: false }) || null,
    operativaAt: p.hubspotStageSyncedAt,
    etapa: p.hubspotPipelineStageLabel
      ? {
          label: p.hubspotPipelineStageLabel,
          fuente: "el pipeline de HubSpot",
          at: p.hubspotStageSyncedAt,
        }
      : null,
    /* ⚠ La fecha es la del documento, el texto es el del embudo: si viene vacío NO se registra
       la fuente (el armador omite los bloques vacíos de los dos lados), así que un proyecto sin
       handoff generado no gana una fuente hueca que el modelo podría citar. */
    handoff: handoffTexto.trim() ? { texto: handoffTexto, at: p.handoff?.updatedAt ?? null } : null,
    sesiones: sesiones.map((s, i) => ({
      id: s.id,
      title: s.title,
      date: s.date,
      /* `null` cuando la reunión no dejó NADA: el armador la cuenta como reunión sin material en
         vez de volverla citable. */
      content: contenidos[i],
      etiquetaDeSala: etiquetaDeSala(s, dominiosPropios),
    })),
    desviaciones: desviaciones.map((d) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      detail: d.detail,
      lastDetectedAt: d.lastDetectedAt,
    })),
    cobertura: { ocurridas: totalOcurridas, sinRegistro },
  };
}

/**
 * Genera (o regenera) el resumen citado de un proyecto.
 *
 * ⚠ Sin el agente sembrado devuelve `skipped`, no un error: es un estado de configuración, y
 * tratarlo como falla llenaría el feed de corridas rojas que no son culpa de nadie.
 */
export async function runProjectBrief(
  projectId: string,
  opts?: { triggeredByEmail?: string | null },
): Promise<ProjectBriefResult> {
  const agent = await prisma.agent.findUnique({
    where: { id: AGENT_ID },
    select: { systemPrompt: true },
  });
  if (!agent) return { status: "skipped", reason: "agent_not_seeded" };

  // El proyecto debe existir ANTES de crear la corrida: `AgentRun.projectId` tiene FK, y sin
  // esto un id inválido reventaría el create en vez de devolver `skipped`.
  const existe = await prisma.project.findUnique({
    where: { id: projectId },
    select: { clientId: true },
  });
  if (!existe) return { status: "skipped", reason: "no_project" };

  const run = await prisma.agentRun.create({
    data: {
      agentId: AGENT_ID,
      agentSlug: AGENT_SLUG,
      projectId,
      clientId: existe.clientId,
      status: "RUNNING",
      stepLabel: "Resumen del proyecto",
      triggeredByEmail: opts?.triggeredByEmail ?? null,
    },
    select: { id: true },
  });

  try {
    /* Marca ANTES de leer: si algo marca el brief como vencido DURANTE la generación (la otra PC,
       una sesión que entra), esa marca tiene que SOBREVIVIR al upsert de abajo. */
    const leidoEn = new Date();
    const datos = await cargarDatos(projectId);
    if (!datos) {
      await marcarError(run.id, "El proyecto desapareció mientras se generaba.");
      return { status: "skipped", reason: "no_project", runId: run.id };
    }

    const ctx = armarContextoDeBrief(datos);
    if (ctx.sources.size === 0) {
      /* Sin material no se llama al modelo: pagarlo para que descarte todo y lance sería tirar
         plata, y el mensaje que saldría («ningún statement con fuente válida») mandaría a
         investigar el prompt en vez del hueco real, que es que no hay de dónde sacar nada. */
      await marcarError(
        run.id,
        "Este proyecto todavía no tiene material citable: sin reuniones con contenido, ni estado " +
          "en HubSpot, ni desviaciones registradas no hay de dónde sacar un resumen.",
      );
      return { status: "skipped", reason: "sin_material", runId: run.id };
    }

    const rawText = await generarTextoDeBrief(
      agent.systemPrompt,
      ctx.serialized,
      "Redactá el resumen de cómo va ESTE proyecto según tus instrucciones.",
    );
    const { headline, statements, discarded } = parsearBriefCitado(rawText, ctx.sources);

    await prisma.projectBrief.upsert({
      where: { projectId },
      create: {
        projectId,
        headline,
        statements: statements as unknown as Prisma.InputJsonValue,
        agentRunId: run.id,
        generatedAt: new Date(),
      },
      update: {
        headline,
        statements: statements as unknown as Prisma.InputJsonValue,
        agentRunId: run.id,
        generatedAt: new Date(),
      },
    });

    /* Limpiar la marca explícita SOLO si es anterior a la lectura del contexto: una marca puesta
       mientras el modelo escribía habla de algo que este resumen NO vio. */
    await prisma.projectBrief.updateMany({
      where: { projectId, staleAt: { lt: leidoEn } },
      data: { staleAt: null },
    });

    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "DONE", output: JSON.stringify({ statements: statements.length, discarded }) },
    });
    return { status: "ok", runId: run.id, statements: statements.length, discarded };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error desconocido";
    await marcarError(run.id, mensaje);
    return { status: "error", runId: run.id, error: mensaje };
  }
}

/** La causa queda EN la corrida: un fallo mudo es peor que uno feo. */
async function marcarError(runId: string, error: string): Promise<void> {
  await prisma.agentRun
    .update({ where: { id: runId }, data: { status: "ERROR", output: JSON.stringify({ error }) } })
    .catch(() => null);
}
