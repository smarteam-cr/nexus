/**
 * /api/marketing/ideas/[id] — PATCH (transición de estado used/selected y/o
 * edición de copy/title/imageConcept) · DELETE (podar). Editores.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardMarketingEditor } from "@/lib/auth/api-guards";
import { deleteIdea, patchIdea } from "@/lib/marketing/mutations";
import { ideaPatchSchema } from "@/lib/marketing/schema";

/** ¿El error de Prisma es "no se encontró la fila"? (P2025) */
function isNotFound(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025";
}

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
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  try {
    // Un solo update atómico (transiciones + edición); campos ausentes no se tocan.
    // El "quién" de la aceptación sale del guard (no del body); el destino efectivo
    // lo decide patchIdea según el rol.
    const idea = await patchIdea(id, parsed.data, {
      byEmail: guard.user.email,
      role: guard.role,
    });
    return NextResponse.json({ idea });
  } catch (e) {
    if (isNotFound(e)) return NextResponse.json({ error: "La idea no existe" }, { status: 404 });
    return NextResponse.json({ error: "No se pudo actualizar la idea." }, { status: 500 });
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
