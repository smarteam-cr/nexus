/**
 * POST /api/business-cases/[id]/blocks/[blockId]/ai-edit { instruction }
 *
 * Edición por IA de UN bloque: Claude recibe el content actual + la instrucción
 * y devuelve el nuevo content (validado contra el schema del blockType). El
 * bloque vuelve a DRAFT (source MODIFIED). Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { anthropic } from "@/lib/anthropic";
import { setBlockContent, BLOCK_CONTENT_SCHEMAS, AiEditBody } from "@/lib/business-cases";

const MODEL = "claude-sonnet-4-6";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; blockId: string }> },
) {
  const { blockId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = AiEditBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  const block = await prisma.businessCaseBlock.findUnique({
    where: { id: blockId },
    select: { id: true, blockType: true, content: true },
  });
  if (!block) {
    return NextResponse.json({ error: "Bloque no existe" }, { status: 404 });
  }

  const schema = BLOCK_CONTENT_SCHEMAS[block.blockType];

  let newContent: Record<string, unknown>;
  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: `Editás un bloque de un Business Case de Smarteam (tipo ${block.blockType}). Devolvé SOLO el JSON del nuevo "content" del bloque, sin texto alrededor ni fences. Respetá el schema del content y NO inventes datos que no estén en el content actual o la instrucción.`,
      messages: [
        {
          role: "user",
          content: `Content actual:\n${JSON.stringify(block.content)}\n\nInstrucción: ${parsed.data.instruction}\n\nDevolvé el nuevo content (objeto JSON).`,
        },
      ],
    });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    newContent = parseObject(text);
  } catch (e) {
    return NextResponse.json(
      { error: "La edición por IA falló: " + (e instanceof Error ? e.message : "error desconocido") },
      { status: 500 },
    );
  }

  const result = schema.safeParse(newContent);
  const content = (result.success ? result.data : newContent) as Record<string, unknown>;
  const updated = await setBlockContent(blockId, content, true);
  return NextResponse.json({ block: updated });
}

function parseObject(text: string): Record<string, unknown> {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return {};
  try {
    const o: unknown = JSON.parse(s.slice(start, end + 1));
    return o && typeof o === "object" ? (o as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
