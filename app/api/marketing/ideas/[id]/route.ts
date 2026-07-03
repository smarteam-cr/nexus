/**
 * /api/marketing/ideas/[id] — DELETE (podar una idea). Editores.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMarketingEditor } from "@/lib/auth/api-guards";
import { deleteIdea } from "@/lib/marketing/mutations";

type Params = { params: Promise<{ id: string }> };

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
