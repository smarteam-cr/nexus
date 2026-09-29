/**
 * lib/canvas/diagnostico-generate.ts
 *
 * Runner del canvas "Diagnóstico" (informe PARA EL CLIENTE). Self-contained, calcado de
 * `exploracion-generate.ts`: asegura el canvas, arma el input desde las fuentes, corre el agente
 * tipado y persiste 1 CARD por sección EN EL LUGAR.
 *
 * ── LAS FUENTES (2026-09-28, «el agente escucha») ────────────────────────────────
 * El diagnóstico se escribe DESPUÉS de las encuestas y de las sesiones de exploración, así que lee:
 *   1. Las REUNIONES de su «Contexto» (lib/contexto/material-del-documento.ts): arranca con toda
 *      reunión del proyecto con el cliente y el CSE saca o agrega. Lo que el panel dice que alimenta
 *      es exactamente lo que se lee. Antes no leía NINGUNA reunión.
 *   2. Las NOTAS que el CSE pegó en ese mismo Contexto.
 *   3. Las respuestas a la ENCUESTA previa (lib/cuestionario/contexto.ts).
 *   4. La FICHA del cliente CONFIRMADA, sin sus campos internos (`fichaParaPrompt` con
 *      `paraDocumentoDelCliente`): apertura a la asesoría, motivación y oportunidades no entran.
 *   5. El HANDOFF con allowlist RESTRICTIVA (cliente-safe), ahora con «Resultados que el cliente
 *      necesita alcanzar»: de ahí salen los objetivos.
 *   6. La EXPLORACIÓN completa (interna), con la regla dura de que lo «sin verificar» no se afirma.
 *   7. Los PROCESOS REALES del cliente (dolores marcados ⚠).
 *   8. El CRONOGRAMA, solo lectura: el punto de partida del proyecto (qué dura y qué entrega).
 *
 * ── LO QUE YA NO HACE ────────────────────────────────────────────────────────────
 * No ubica en la Escala (llega la 7.0), no describe cómo va a operar (Planificación) y no recomienda
 * (Ejecución). Al regenerar, RETIRA esas secciones de un diagnóstico viejo
 * (SECCIONES_RETIRADAS_DEL_DIAGNOSTICO): el documento regenerado tiene solo la estructura nueva.
 *
 * Lo dispara el botón del header (CANVAS_PRIMARY_AGENT, async) vía POST /analyze.
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
import { generateSectionsForTemplate } from "@/lib/business-cases/canvas-agent";
import {
  DIAGNOSTICO_TEMPLATE,
  DIAGNOSTICO_HANDOFF_KEYS,
  SECCIONES_RETIRADAS_DEL_DIAGNOSTICO,
} from "@/components/landing/configs/diagnostico.defs";
import { tagLabels } from "@/lib/tags/catalog";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { loadCuestionarioContext } from "@/lib/cuestionario/contexto";
import { fichaParaPrompt, leerFicha } from "@/lib/clients/ficha";
import { cargarMaterialDelDocumento } from "@/lib/contexto/material-del-documento";
import { documentoConContexto } from "@/lib/contexto/documento";
import { ordenarObjetivosDelDiagnostico } from "@/lib/canvas/diagnostico-hilo";

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

function fechaCorta(ms: number): string {
  return new Date(ms).toLocaleDateString("es-CR", { day: "numeric", month: "long", timeZone: "America/Costa_Rica" });
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
  const doc = documentoConContexto("diagnosis")!;

  const [canvasId, handoffCtx, exploracionCtx, timelineCtx, encuestaCtx, material, project] = await Promise.all([
    opts.canvasId ?? ensureDiagnosticoCanvas(projectId),
    loadHandoffContext(projectId, { onlyConfirmed: false, includeKeys: DIAGNOSTICO_HANDOFF_KEYS }),
    loadCanvasContext(projectId, "exploration", { onlyConfirmed: false }),
    loadTimelineContext(projectId),
    loadCuestionarioContext(projectId).catch(() => ""),
    cargarMaterialDelDocumento(projectId, doc),
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        name: true,
        tags: true,
        clientId: true,
        client: { select: { name: true, company: true, industry: true, ficha: true } },
      },
    }),
  ]);

  const procesosCtx = project?.clientId
    ? await serializeProcesosForPrompt(project.clientId, { onlyConfirmed: false })
    : "";
  // ⛔ Sin los campos internos: este informe lo lee el cliente (lib/clients/ficha.ts).
  const fichaCtx = fichaParaPrompt(leerFicha(project?.client?.ficha), { paraDocumentoDelCliente: true });

  const companyName = project?.client?.name ?? project?.client?.company ?? "el cliente";
  const hubs = tagLabels(project?.tags ?? []);
  const r = material.resumen;
  const encuadreDeReuniones = r.leidas
    ? `Se leyeron ${r.leidas} reuniones${r.desde && r.hasta ? `, entre el ${fechaCorta(r.desde)} y el ${fechaCorta(r.hasta)}` : ""}.`
    : "No hay reuniones con contenido en el contexto de este diagnóstico.";

  const userMessage = [
    `Empresa: ${companyName}`,
    `Industria: ${project?.client?.industry ?? "No especificada"}`,
    `Proyecto: ${project?.name ?? "(sin nombre)"}`,
    hubs.length ? `Hubs/áreas del proyecto (dirigen QUÉ frentes cubre el informe): ${hubs.join(", ")}` : "",
    "",
    `=== LAS SESIONES CON EL CLIENTE (la fuente principal) ===\n${encuadreDeReuniones}\nCada reunión trae su sala: lo dicho [PUERTAS ADENTRO] es de Smarteam y NUNCA se le atribuye al cliente.`,
    material.reuniones,
    material.notas ? `\n=== NOTAS DEL EQUIPO PARA ESTE DIAGNÓSTICO (pesan como una fuente más; si contradicen una reunión, gana la más reciente) ===\n${material.notas}` : "",
    encuestaCtx ? `\n=== RESPUESTAS DEL CLIENTE A LA ENCUESTA PREVIA ===\n${encuestaCtx}` : "",
    fichaCtx ? `\n${fichaCtx}` : "",
    "\n=== LO QUE SE CONVERSÓ AL VENDER EL PROYECTO (solo lo apto para el cliente) ===",
    handoffCtx || "(Sin handoff generado.)",
    exploracionCtx
      ? `\n=== EXPLORACIÓN (interna — lo confirmado y lo supuesto) ===\nREGLA DURA: lo que esta fuente marque como supuesto o "sin verificar" NUNCA se afirma como hecho en el informe.\n${exploracionCtx}`
      : "",
    procesosCtx ? `\n=== PROCESOS REALES DEL CLIENTE (⚠ = fricción detectada) ===\n${procesosCtx}` : "",
    timelineCtx ? `\n=== EL PROYECTO CONTRATADO (solo para el punto de partida: qué dura y qué entrega) ===\n${timelineCtx}` : "",
    "",
    "Escribe el informe siguiendo tus instrucciones: el hilo completo con sus códigos (S, F, OBJ), sin escala de madurez, sin cómo va a operar y sin recomendaciones.",
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

  const generado = await generateSectionsForTemplate(DIAGNOSTICO_TEMPLATE, userMessage, undefined, undefined, prevDataByKey);
  // Los OBJ en orden (cuantitativos primero, seguidos) y sus menciones reescritas: no se le pide al
  // modelo, se ordena acá (lib/canvas/diagnostico-hilo.ts).
  const gen = { ...generado, sections: ordenarObjetivosDelDiagnostico(generado.sections) };

  // Persistir 1 CARD/sección EN EL LUGAR. Las solo-lectura y el `cierre` (agentGenerated:false)
  // no vienen en gen.sections → sus bloques quedan intactos hasta el retiro de abajo.
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

  /* El retiro: un diagnóstico regenerado con la estructura nueva no puede seguir mostrando la escala,
     las causas sueltas o las recomendaciones de la versión anterior — se contradicen con el hilo. Se
     borran las SECCIONES (los bloques caen en cascada) y no se re-crean: ya no están en el canon de
     canvas-defs. Solo si la generación escribió algo: un fallo no puede dejar el documento vacío. */
  if (sectionCount > 0) {
    await prisma.canvasSection.deleteMany({
      where: { canvasId, key: { in: [...SECCIONES_RETIRADAS_DEL_DIAGNOSTICO] } },
    });
  }
  return { canvasId, sectionCount };
}
