/**
 * /api/marketing/pillars — pilares de contenido + sugerencias PENDING del agente.
 * GET lista (pilares + sugerencias) · POST crea pilar. Escritura: editores.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser, guardMarketingEditor } from "@/lib/auth/api-guards";
import { getPillars, getPendingSuggestions } from "@/lib/marketing/queries";
import { createPillar } from "@/lib/marketing/mutations";
import { pillarCreateSchema } from "@/lib/marketing/schema";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const [pillars, suggestions] = await Promise.all([getPillars(), getPendingSuggestions()]);
  return NextResponse.json({ pillars, suggestions });
}

export async function POST(req: NextRequest) {
  const guard = await guardMarketingEditor();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = pillarCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
  }

  try {
    const pillar = await createPillar({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    });
    return NextResponse.json({ pillar }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ya existe un pilar con ese nombre." }, { status: 409 });
  }
}
