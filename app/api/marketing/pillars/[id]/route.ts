/**
 * /api/marketing/pillars/[id] — PATCH campos/active · DELETE (las ideas quedan
 * sin pilar por SetNull, no se pierden). Editores.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMarketingEditor } from "@/lib/auth/api-guards";
import { updatePillar, deletePillar } from "@/lib/marketing/mutations";
import { pillarPatchSchema } from "@/lib/marketing/schema";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardMarketingEditor();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = pillarPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
  }

  try {
    const pillar = await updatePillar(id, parsed.data);
    return NextResponse.json({ pillar });
  } catch {
    return NextResponse.json({ error: "No se pudo actualizar (¿nombre duplicado o pilar inexistente?)" }, { status: 409 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardMarketingEditor();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  try {
    await deletePillar(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "El pilar no existe" }, { status: 404 });
  }
}
