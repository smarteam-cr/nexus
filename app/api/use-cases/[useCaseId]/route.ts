/**
 * /api/use-cases/[useCaseId]
 *   PATCH  → actualiza campos del caso de uso
 *   DELETE → borra SOLO si ningún BC lo referencia (409 si hay pivotes — el cascade
 *            borraría selecciones vivas de BCs en trabajo; desactivar es el camino default)
 *
 * Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { sanitizeTags } from "@/lib/tags/catalog";
import { bcTypeOrNull } from "@/lib/business-cases/case-types";

function sanitizeAppliesTo(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((s): s is string => typeof s === "string" && !!bcTypeOrNull(s)))];
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ useCaseId: string }> },
) {
  const { useCaseId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  let body: {
    title?: unknown;
    description?: unknown;
    price?: unknown;
    appliesTo?: unknown;
    tags?: unknown;
    active?: unknown;
    order?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.description === "string" && body.description.trim()) data.description = body.description.trim();
  if (body.price !== undefined) {
    data.price = typeof body.price === "string" && body.price.trim() ? body.price.trim() : null;
  }
  if (body.appliesTo !== undefined) data.appliesTo = sanitizeAppliesTo(body.appliesTo);
  if (body.tags !== undefined) data.tags = sanitizeTags(body.tags);
  if (typeof body.active === "boolean") data.active = body.active;
  if (typeof body.order === "number") data.order = body.order;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar." }, { status: 400 });
  }

  try {
    const updated = await prisma.useCase.update({ where: { id: useCaseId }, data });
    return NextResponse.json({ useCase: updated });
  } catch {
    return NextResponse.json({ error: "Caso de uso no encontrado." }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ useCaseId: string }> },
) {
  const { useCaseId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const refs = await prisma.businessCaseUseCase.count({ where: { useCaseId } });
  if (refs > 0) {
    return NextResponse.json(
      { error: `Este caso de uso está seleccionado en ${refs} business case(s). Desactivalo en vez de borrarlo.` },
      { status: 409 },
    );
  }

  try {
    await prisma.useCase.delete({ where: { id: useCaseId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Caso de uso no encontrado." }, { status: 404 });
  }
}
