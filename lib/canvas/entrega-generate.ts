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
 *
 * No es una optimización: es la única promesa de honestidad del documento. Un modelo que
 * escribe «se completó el 100% del plan» en el papel que el cliente archiva no tiene quién
 * lo contradiga. Acá no puede, porque nunca se le pregunta.
 *
 * ⚠ Y por eso los números se escriben DESPUÉS de la generación: si el agente devolviera algo
 * para esas keys —no puede, pero si el template cambiara— este paso lo pisa igual.
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { ENTREGA_CANVAS, entregaSectionSequence } from "@/lib/canvas/canvas-defs";
import { createOnDemandCanvas, reconcileOnDemandCanvasSections } from "@/lib/canvas/default-canvases";
import { loadCanvasContext, loadHandoffContext } from "@/lib/canvas/load-canvas-context";
import { serializeProcesosForPrompt } from "@/lib/canvas/read-procesos";
import { generateSectionsForTemplate } from "@/lib/business-cases/canvas-agent";
import { ENTREGA_TEMPLATE } from "@/components/landing/configs/entrega.defs";
import { tagLabels } from "@/lib/tags/catalog";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { getProjectMemberSessions } from "@/lib/sessions/project-sources";
import { fetchTranscriptContent } from "@/lib/sessions/transcript";
import { loadProjectSummary } from "@/lib/portfolio/load";
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
 * Las reuniones del proyecto, de la más nueva hacia atrás, para que el agente cuente lo que
 * pasó de verdad y no lo que se prometió.
 *
 * ⚠ EL PRESUPUESTO ES DE CARACTERES, Y EL RECORRIDO NO SE CORTA POR CANTIDAD DE REUNIONES.
 * Medido en Wherex: de las 12 más recientes, **solo 4 tenían contenido** (las demás no tienen
 * transcripción ni minuta guardada), así que un `slice(0, 12)` gastaba 6.196 de 18.000
 * caracteres y dejaba 53 reuniones sin mirar. Se camina hacia atrás hasta LLENAR el
 * presupuesto; el tope de lecturas acota el trabajo, no el material.
 *
 * Es la lección de la Tanda L aplicada bien: ahí un cupo fijo de 10 dejaba afuera el 64% del
 * material de un proyecto con ritmo semanal denso.
 */
async function ultimasSesiones(
  projectId: string,
  presupuesto = 18_000,
  topeDeLecturas = 40,
): Promise<{ texto: string; usadas: number; total: number }> {
  const { sessions } = await getProjectMemberSessions(projectId);
  const ordenadas = [...sessions].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const partes: string[] = [];
  let gastado = 0;
  let miradas = 0;
  for (const s of ordenadas) {
    if (gastado >= presupuesto || miradas >= topeDeLecturas) break;
    miradas++;
    const cupo = Math.min(2000, presupuesto - gastado);
    const texto = await fetchTranscriptContent(s.id, s.title, { maxChars: cupo }).catch(() => "");
    if (!texto) continue;
    partes.push(`[${new Date(s.date).toISOString().slice(0, 10)}] ${s.title}\n${texto}`);
    gastado += texto.length;
  }
  return { texto: partes.join("\n\n"), usadas: partes.length, total: ordenadas.length };
}

/** Genera (o regenera) el documento de entrega. */
export async function runEntregaGeneration(opts: {
  projectId: string;
  agentRunId?: string | null;
  canvasId?: string;
}): Promise<{ canvasId: string; sectionCount: number }> {
  const { projectId } = opts;

  const [canvasId, handoffCtx, kickoffCtx, desarrolloCtx, project, summary] = await Promise.all([
    opts.canvasId ?? ensureEntregaCanvas(projectId),
    loadHandoffContext(projectId, { onlyConfirmed: false }),
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
          },
        },
      },
    }),
    loadProjectSummary(projectId).catch(() => null),
  ]);

  const [procesosCtx, reuniones] = await Promise.all([
    project?.clientId ? serializeProcesosForPrompt(project.clientId, { onlyConfirmed: false }) : Promise.resolve(""),
    ultimasSesiones(projectId),
  ]);

  const companyName = project?.client?.name ?? project?.client?.company ?? "el cliente";
  const hubs = tagLabels(project?.tags ?? []);

  const userMessage = [
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
    /* La COBERTURA va explícita. Un agente que ve 4 reuniones sin saber que hay 61 más que no
       se pudieron leer concluye con una confianza que el material no respalda — y en un cierre
       eso se traduce en afirmar que algo «no pasó» cuando simplemente no quedó escrito.
       En Wherex son 4 con contenido sobre 65. */
    reuniones.texto
      ? `\n=== REUNIONES DEL PROYECTO (lo que pasó de verdad) ===\n` +
        `Cobertura: ${reuniones.usadas} reuniones con contenido, de ${reuniones.total} que tuvo el ` +
        `proyecto. Las demás no tienen transcripción ni minuta guardada — eso NO significa que no ` +
        `hayan ocurrido, así que no concluyas nada de su ausencia.\n\n` +
        reuniones.texto
      : "\n=== SIN REUNIONES CON TRANSCRIPCIÓN ===\nNo hay material de sesiones: no inventes citas ni números del negocio del cliente — la sección de impacto va vacía.",
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

  let sectionCount = 0;
  for (const s of gen.sections) {
    // Cinturón: si el template cambiara y le mandara una key derivada al modelo, se descarta.
    if (KEYS_DERIVADAS.has(s.key)) continue;
    if (await escribir(s.key, s.data)) sectionCount++;
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
    reuniones: reuniones.total,
    // El corrimiento atribuido entra cuando se curen las particularidades visibles al cliente.
    corrimiento: null,
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

  return { canvasId, sectionCount };
}
