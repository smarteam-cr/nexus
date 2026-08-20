/**
 * POST /api/projects/[projectId]/canvas-assist — assist de DOCUMENTO del kickoff
 * y del canvas Desarrollo (una sola ruta para ambos: mismo storage CanvasBlock,
 * mismo contrato, distinto template/agente/permiso).
 *
 * { canvasId, instruction } → runDocumentAssist con las secciones GENERABLES del
 * canvas (`agentGenerated !== false && !ctxDriven` — las curadas
 * equipo/horarios/canales/cierre y las ctx cronograma/procesos NO entran: la IA
 * no puede ni proponerlas) + el contexto real del proyecto (handoff curado, y
 * cronograma en el kickoff). Devuelve la PROPUESTA — NO escribe: el apply lo
 * hace el workspace por `upsertCardData` (la vía optimista de siempre).
 *
 * RBAC: acceso al proyecto + la celda `regenerate` de la sección correspondiente
 * (el assist puede reescribir el documento entero — mismo criterio que el
 * regenerate del CanvasAgentButton). Trazabilidad: AgentRun DONE/ERROR.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject, guardPermission } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { runDocumentAssist, type AssistSectionDef } from "@/lib/ai/assist";
import { loadHandoffContext, loadTimelineContext } from "@/lib/canvas/load-canvas-context";
import { pieceForCanvas } from "@/lib/pieces/registry";
import { DOC } from "@/lib/canvas/assist-de-documento";
import { triggeredByEmail } from "@/lib/agents/triggered-by";

const bodySchema = z.object({
  canvasId: z.string().min(1),
  instruction: z.string().trim().min(4).max(2000),
});

type Params = Promise<{ projectId: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const access = await guardAccessToProject(projectId);
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "canvasId e instruction (4 a 2000 caracteres) requeridos" }, { status: 400 });
  }
  const { canvasId, instruction } = parsed.data;

  const canvas = await prisma.projectCanvas.findFirst({
    where: { id: canvasId, projectId },
    select: {
      name: true,
      slug: true,
      canvasSections: {
        orderBy: { order: "asc" },
        select: { key: true, blocks: { orderBy: { order: "asc" }, select: { blockType: true, data: true } } },
      },
    },
  });
  if (!canvas) return NextResponse.json({ error: "Canvas no encontrado" }, { status: 404 });

  /* La identidad del documento es su SLUG, no su rótulo. `pieceForCanvas` ya resuelve el slug
     con el respaldo por nombre histórico para las filas que un script viejo haya creado sin él
     (misma lectura doble que documenta lib/pieces/canvas-query.ts). */
  const pieza = pieceForCanvas(canvas);
  const doc = pieza ? DOC[pieza.slug] : undefined;
  if (!pieza || !doc) {
    return NextResponse.json(
      { error: `Este documento todavía no se puede modificar con IA (${canvas.name}).` },
      { status: 400 },
    );
  }
  /* La celda sale del REGISTRO, no se repite acá: una pieza que cambie de sección de permiso lo
     hace en un solo lugar. */
  const perm = await guardPermission(
    pieza.permissionSection as Parameters<typeof guardPermission>[0],
    "regenerate" as never,
  );
  if (perm instanceof NextResponse) return perm;

  // Contrato: secciones del canvas cuya def es GENERABLE (mismo filtro que la
  // generación completa). currentData = el CARD de la sección (o el empty).
  const sections: AssistSectionDef[] = [];
  for (const s of canvas.canvasSections) {
    const def = doc.defs[s.key];
    if (!def || def.agentGenerated === false || def.ctxDriven) continue;
    const card = s.blocks.find((b) => b.blockType === "CARD");
    sections.push({
      key: def.key,
      label: def.label,
      schema: def.schema,
      brief: def.brief ?? def.agentHint,
      currentData: card?.data ?? def.empty,
    });
  }
  if (sections.length === 0) {
    return NextResponse.json({ error: "El documento no tiene secciones editables por IA todavía." }, { status: 400 });
  }

  // Mismo contexto que usa la generación de cada documento.
  const [agent, project, handoffCtx, timelineCtx] = await Promise.all([
    // Solo `additionalInstructions` (el apéndice calibrable desde /agents): el
    // `systemPrompt` de estos agentes en DB es la nota-puntero al código.
    prisma.agent.findUnique({ where: { id: doc.agentId }, select: { additionalInstructions: true } }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { clientId: true, client: { select: { name: true, industry: true } } },
    }),
    // MISMO contexto que la generación de cada documento (analyze isKickoffAgent /
    // desarrollo-generate): allowlist por doc — el kickoff/desarrollo los lee gente
    // de afuera y las secciones INTERNAS del handoff no deben entrar al prompt.
    loadHandoffContext(projectId, {
      onlyConfirmed: false,
      /* `null` = el handoff entero, y SOLO para documentos internos. Los que el cliente lee
         llevan allowlist: sus secciones internas (riesgos, banderas, acuerdos de la venta) no
         pueden entrar al prompt de algo que se proyecta en pantalla frente a él. */
      ...(doc.handoffKeys ? { includeKeys: doc.handoffKeys as string[] } : {}),
    }),
    doc.conCronograma ? loadTimelineContext(projectId) : Promise.resolve(""),
  ]);

  // La VOZ sale del template del CÓDIGO — misma fuente que usa la generación y que
  // la ruta de assist del business case. Antes se leía `agent.systemPrompt` de la DB,
  // que para estos dos agentes es la nota-puntero ("[NOTA] Este agente genera con el
  // prompt del código…"): el assist corría sin persona ni posicionamiento.
  const systemPrompt = [
    doc.tpl.agentIntro ?? `Mejoras el ${doc.docLabel} de un proyecto de Smarteam (consultora HubSpot).`,
    agent?.additionalInstructions?.trim() || "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const context = [
    `Empresa: ${project?.client.name ?? "—"} · Industria: ${project?.client.industry ?? "No especificada"}`,
    handoffCtx ? `=== HANDOFF CURADO (única fuente de datos del proyecto; no inventes) ===\n${handoffCtx}` : "",
    timelineCtx,
  ]
    .filter(Boolean)
    .join("\n\n");

  const run = await prisma.agentRun.create({
    data: {
      agentId: doc.agentId,
      clientId: project?.clientId ?? null,
      projectId,
      status: "RUNNING",
      stepLabel: `Assist · ${canvas.name}`,
      triggeredByEmail: await triggeredByEmail(),
    },
    select: { id: true },
  });

  try {
    const result = await runDocumentAssist({
      docLabel: doc.docLabel,
      systemPrompt,
      sections,
      instruction,
      context,
      // Mismo gate que la generación: el requerimiento técnico (brandVoice:false)
      // no lleva voz comercial; el kickoff sí (lo lee el cliente).
      brandVoice: doc.tpl.brandVoice !== false,
      maxWebSearches: 3,
    });
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "DONE", output: JSON.stringify(result) },
    });
    return NextResponse.json({ ...result, runId: run.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "el assist falló — prueba de nuevo";
    await prisma.agentRun
      .update({ where: { id: run.id }, data: { status: "ERROR", output: JSON.stringify({ error: message }) } })
      .catch(() => {});
    console.error("[canvas-assist] error:", e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
