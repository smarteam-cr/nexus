/**
 * /api/marketing/ideas/[id] — PATCH { used: boolean } (marcar/desmarcar
 * utilizada) · DELETE (podar). Editores.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMarketingEditor } from "@/lib/auth/api-guards";
import { deleteIdea, markIdeaUsed } from "@/lib/marketing/mutations";
import { ideaPatchSchema } from "@/lib/marketing/schema";

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
  const parsed = ideaPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido (used: boolean)" }, { status: 400 });
  }

  try {
    const idea = await markIdeaUsed(id, parsed.data.used);
    return NextResponse.json({ idea });
  } catch {
    return NextResponse.json({ error: "La idea no existe" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardMarketingEditor();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  try {
    await deleteIdea(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "La idea no existe" }, { status: 404 });
  }
}
