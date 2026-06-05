import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { loadCanvasContext, loadTimelineContext } from "@/lib/canvas/load-canvas-context";
import { getSingleBlockOutputInstructions } from "@/lib/canvas/agent-output-schema";
import { validateBlockPayload } from "@/lib/canvas/validate-block-payload";

/**
 * POST /api/projects/[projectId]/canvas-sections/[sectionId]/blocks/regenerate
 *
 * Edición granular por IA (Fase B.1). Toma { blockId, instruction } y DEVUELVE el
 * content/data regenerado de ESE bloque — NO escribe. El guardado lo hace el front
 * por el PUT (saveBlock), la misma vía de siempre. Reusa los ingredientes del agente
 * de kickoff (contexto del handoff/cronograma + systemPrompt + el cliente Claude),
 * sin tocar el pipeline de generación completa de analyze.
 *
 * Alcance B.1: solo bloques del canvas "Kickoff".
 */
type Params = Promise<{ projectId: string; sectionId: string }>;

const KICKOFF_AGENT_ID = "agent-kickoff-canvas";

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { projectId, sectionId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const body = (await req.json().catch(() => ({}))) as { blockId?: string; instruction?: string };
  const blockId = typeof body.blockId === "string" ? body.blockId : "";
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!blockId || !instruction) {
    return NextResponse.json({ error: "blockId e instruction requeridos" }, { status: 400 });
  }

  // Cargar el bloque + su sección + canvas (validar pertenencia al proyecto + Kickoff).
  const block = await prisma.canvasBlock.findFirst({
    where: { id: blockId, sectionId },
    select: {
      blockType: true,
      content: true,
      data: true,
      section: { select: { label: true, canvas: { select: { name: true, projectId: true } } } },
    },
  });
  if (!block || block.section.canvas.projectId !== projectId) {
    return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
  }
  if (block.section.canvas.name !== "Kickoff") {
    return NextResponse.json({ error: "Regeneración por IA solo soportada en el canvas Kickoff" }, { status: 400 });
  }

  // Mismo contexto que usa el agente de kickoff.
  const [handoffCtx, timelineCtx, agent, project] = await Promise.all([
    loadCanvasContext(projectId, "Handoff", { onlyConfirmed: true }),
    loadTimelineContext(projectId),
    prisma.agent.findUnique({
      where: { id: KICKOFF_AGENT_ID },
      select: { systemPrompt: true, additionalInstructions: true },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { client: { select: { name: true, industry: true } } },
    }),
  ]);

  const basePrompt = agent?.additionalInstructions
    ? `${agent.systemPrompt}\n\n${agent.additionalInstructions}`
    : agent?.systemPrompt ?? "Generás contenido de la landing de kickoff de cara al cliente de Smarteam.";
  const systemPrompt = `${basePrompt}\n\n${getSingleBlockOutputInstructions(block.blockType)}`;

  const currentBlock = JSON.stringify({
    type: block.blockType.toLowerCase(),
    content: block.content ?? undefined,
    data: block.data ?? undefined,
  });

  const userMessage = `Empresa: ${project?.client.name ?? "—"}
Industria: ${project?.client.industry ?? "No especificada"}

=== HANDOFF CURADO (única fuente; no inventes datos que no estén) ===
${handoffCtx || "(Sin handoff confirmado; mantené el bloque conservador y marcá lo que falte.)"}

${timelineCtx ? `${timelineCtx}\n\n` : ""}=== BLOQUE ACTUAL (sección "${block.section.label}") ===
${currentBlock}

=== INSTRUCCIÓN DEL CSE ===
${instruction}

Regenerá SOLO este bloque, manteniendo el tono cliente y la disciplina del kickoff. Devolvé el JSON de un único bloque.`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });
    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "La IA no devolvió un bloque válido." }, { status: 502 });
    }
    let parsed: { type?: string; content?: unknown; data?: unknown };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: "La IA devolvió JSON malformado." }, { status: 502 });
    }

    // Borde duro: o el payload matchea el tipo completo, o error limpio (nunca a medias).
    const validated = validateBlockPayload(block.blockType, parsed);
    if ("error" in validated) {
      console.warn("[blocks/regenerate] payload inválido:", validated.error);
      return NextResponse.json({ error: validated.error }, { status: 502 });
    }

    // Solo devolvemos content/data — el front persiste por el PUT (saveBlock). Acá NO se escribe.
    return NextResponse.json({
      blockType: block.blockType,
      content: validated.content,
      data: validated.data,
    });
  } catch (e) {
    console.error("[blocks/regenerate] error:", e);
    return NextResponse.json({ error: "regenerate_failed" }, { status: 500 });
  }
}
