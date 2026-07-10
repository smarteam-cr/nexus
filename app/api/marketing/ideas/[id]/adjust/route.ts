/**
 * POST /api/marketing/ideas/[id]/adjust — ajusta el copy de una idea con IA
 * según { instruction }. DEVUELVE { copy } sin persistir: el front lo aplica al
 * campo editable y guarda por el PATCH normal (mismo patrón que el regenerate de
 * Business Cases). Editores.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMarketingEditor } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { adjustIdeaCopy } from "@/lib/marketing/agents/adjust-idea";
import { ideaAdjustSchema } from "@/lib/marketing/schema";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await guardMarketingEditor();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = ideaAdjustSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Instrucción inválida" }, { status: 400 });
  }

  const idea = await prisma.contentIdea.findUnique({ where: { id }, select: { copy: true } });
  if (!idea) return NextResponse.json({ error: "La idea no existe" }, { status: 404 });

  const settings = await prisma.marketingSettings.findUnique({
    where: { id: "marketing" },
    select: { brandVoice: true },
  });

  try {
    const copy = await adjustIdeaCopy(idea.copy, parsed.data.instruction, settings?.brandVoice);
    if (!copy) return NextResponse.json({ error: "La IA no devolvió texto." }, { status: 502 });
    return NextResponse.json({ copy });
  } catch {
    return NextResponse.json({ error: "No se pudo ajustar con IA. Probá de nuevo." }, { status: 502 });
  }
}
