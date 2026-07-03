/**
 * /api/marketing/personas/[id] — PATCH campos/active · DELETE. Editores.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMarketingEditor } from "@/lib/auth/api-guards";
import { updatePersona, deletePersona } from "@/lib/marketing/mutations";
import { personaPatchSchema } from "@/lib/marketing/schema";

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
  const parsed = personaPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
  }

  try {
    const persona = await updatePersona(id, parsed.data);
    return NextResponse.json({ persona });
  } catch {
    return NextResponse.json({ error: "La persona no existe" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardMarketingEditor();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  try {
    await deletePersona(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "La persona no existe" }, { status: 404 });
  }
}
