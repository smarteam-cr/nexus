/**
 * PATCH /api/business-cases/[id]/tags
 *
 * La clasificación del business case: UNA lista de slugs del mismo catálogo que el proyecto
 * (`lib/tags/catalog.ts`), productos + alcance + tipo de implementación + modalidad. Se PROPAGA
 * al Project cuando se crea el handoff desde el deal del BC (POST /api/handoffs y POST /api/projects).
 *
 * ⚠ 2026-08-12: dejó de aceptar `implementationType`. Ese dato ahora es un tag más y viaja dentro
 * de `tags` — un cuerpo con el campo viejo se ignora en silencio (no es un error del cliente:
 * es un campo que ya no existe, y devolver 400 rompería una pestaña abierta desde antes del deploy).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { sanitizeTags } from "@/lib/tags/catalog";

// GET: clasificación actual del business case (tags normalizados).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({
    where: { id },
    select: { tags: true },
  });
  if (!bc) return NextResponse.json({ error: "Esa propuesta no existe" }, { status: 404 });
  return NextResponse.json({ tags: sanitizeTags(bc.tags) });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({ where: { id }, select: { id: true } });
  if (!bc) return NextResponse.json({ error: "Esa propuesta no existe" }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const body = raw as { tags?: unknown } | null;
  if (body?.tags === undefined) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  const updated = await prisma.businessCase.update({
    where: { id },
    data: { tags: sanitizeTags(body.tags) },
    select: { tags: true },
  });
  return NextResponse.json(updated);
}
