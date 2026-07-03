/**
 * /api/marketing/sources/[id] — PATCH url/label/active · DELETE (CASCADE borra
 * sus posts). Editores.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMarketingEditor } from "@/lib/auth/api-guards";
import { updateSource, deleteSource } from "@/lib/marketing/mutations";
import { sourcePatchSchema } from "@/lib/marketing/schema";

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
  const parsed = sourcePatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input inválido" }, { status: 400 });
  }

  try {
    const source = await updateSource(id, parsed.data);
    return NextResponse.json({ source });
  } catch {
    return NextResponse.json({ error: "No se pudo actualizar (¿URL duplicada o fuente inexistente?)" }, { status: 409 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardMarketingEditor();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  try {
    await deleteSource(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "La fuente no existe" }, { status: 404 });
  }
}
