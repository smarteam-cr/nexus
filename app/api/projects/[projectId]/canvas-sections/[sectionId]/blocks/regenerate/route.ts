import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { loadCanvasContext, loadTimelineContext } from "@/lib/canvas/load-canvas-context";
import { getSingleBlockOutputInstructions } from "@/lib/canvas/agent-output-schema";
import { validateBlockPayload } from "@/lib/canvas/validate-block-payload";
import { regenerateSectionDataForDef } from "@/lib/business-cases/canvas-agent";
import { KICKOFF_DEF_BY_KEY } from "@/components/landing/configs/kickoff.defs";

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

  const body = (await req.json().catch(() => ({}))) as {
    blockId?: string;
    instruction?: string;
    // Multi-turno (B.2): punto de partida de la regen. Si viene, el prompt parte de este
    // draft en progreso en vez del bloque guardado (encadena "más corto" → "más formal").
    base?: { content?: string | null; data?: unknown };
  };
  const blockId = typeof body.blockId === "string" ? body.blockId : "";
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  if (!blockId || !instruction) {
    return NextResponse.json({ error: "blockId e instruction requeridos" }, { status: 400 });
  }
  // Guard mínimo: aceptar base solo si es objeto. Es input no confiable, pero SOLO alimenta
  // el prompt — el OUTPUT igual pasa por validateBlockPayload y el guardado es un PUT aparte.
  const base = body.base && typeof body.base === "object" ? body.base : null;

  // Cargar el bloque + su sección + canvas (validar pertenencia al proyecto + Kickoff).
  const block = await prisma.canvasBlock.findFirst({
    where: { id: blockId, sectionId },
    select: {
      blockType: true,
      content: true,
      data: true,
      section: { select: { key: true, label: true, canvas: { select: { name: true, projectId: true } } } },
    },
  });
  if (!block || block.section.canvas.projectId !== projectId) {
    return NextResponse.json({ error: "Bloque no encontrado" }, { status: 404 });
  }
  if (block.section.canvas.name !== "Kickoff") {
    return NextResponse.json({ error: "Regeneración por IA solo soportada en el canvas Kickoff" }, { status: 400 });
  }

  // ── Kickoff TIPADO: bloque CARD de una sección de prosa generable → regen por SCHEMA
  // (motor de secciones, igual que Business Cases). Devuelve {data}. El markdown legacy
  // (bloques TEXT viejos) sigue por el camino de abajo hasta que se regenere el kickoff. ──
  const def = KICKOFF_DEF_BY_KEY[block.section.key];
  if (block.blockType === "CARD" && def) {
    if (def.agentGenerated === false) {
      return NextResponse.json({ error: "Esta sección se cura a mano; no se regenera con IA." }, { status: 400 });
    }
    try {
      const currentData = (base ? base.data : block.data) ?? {};
      const newData = await regenerateSectionDataForDef(def, currentData, instruction, def.brief);
      return NextResponse.json({ blockType: "CARD", data: newData });
    } catch (e) {
      console.error("[blocks/regenerate typed] error:", e);
      return NextResponse.json({ error: "regenerate_failed" }, { status: 500 });
    }
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
  const tuteoRule =
    'ESTILO (OBLIGATORIO): español con TUTEO neutro (segunda persona con "tú"). Conjuga SIEMPRE en forma de tú: "Transforma", "centraliza", "optimiza", "tienes", "puedes". PROHIBIDO el voseo: NUNCA escribas "Transformá", "centralizá", "tenés", "querés", "podés" ni "vos".';
  const systemPrompt = `${basePrompt}\n\n${tuteoRule}\n\n${getSingleBlockOutputInstructions(block.blockType)}`;

  // Multi-turno: si vino un draft en progreso (base), la regen parte de ESE estado, no del
  // bloque guardado. El tipo SIEMPRE sale de la DB (base no puede cambiarlo). Sin base →
  // idéntico a B.1 (single-turn).
  const currentBlock = JSON.stringify({
    type: block.blockType.toLowerCase(),
    content: (base ? base.content : block.content) ?? undefined,
    data: (base ? base.data : block.data) ?? undefined,
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
