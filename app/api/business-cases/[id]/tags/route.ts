/**
 * PATCH /api/business-cases/[id]/tags
 *
 * Tags de clasificación del business case (mismo catálogo que el proyecto). `tags` = slugs
 * de product+scope; `implementationType` = modalidad (impl/re-impl). Se PROPAGAN al Project
 * cuando se crea el handoff desde el deal del BC (POST /api/handoffs).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { sanitizeTags } from "@/lib/tags/catalog";
import type { ImplementationType } from "@prisma/client";

const MODALITIES = ["IMPLEMENTATION", "REIMPLEMENTATION"] as const;

// GET: clasificación actual del business case (tags normalizados + modalidad).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({
    where: { id },
    select: { tags: true, implementationType: true },
  });
  if (!bc) return NextResponse.json({ error: "Business case no existe" }, { status: 404 });
  return NextResponse.json({ tags: sanitizeTags(bc.tags), implementationType: bc.implementationType });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const bc = await prisma.businessCase.findUnique({ where: { id }, select: { id: true } });
  if (!bc) return NextResponse.json({ error: "Business case no existe" }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const body = raw as { tags?: unknown; implementationType?: unknown } | null;

  const data: { tags?: string[]; implementationType?: ImplementationType | null } = {};
  if (body?.tags !== undefined) data.tags = sanitizeTags(body.tags);
  if (body?.implementationType !== undefined) {
    const v = body.implementationType;
    if (v !== null && !(typeof v === "string" && (MODALITIES as readonly string[]).includes(v))) {
      return NextResponse.json({ error: "implementationType inválido" }, { status: 400 });
    }
    data.implementationType = (v as ImplementationType | null) ?? null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  const updated = await prisma.businessCase.update({
    where: { id },
    data,
    select: { tags: true, implementationType: true },
  });
  return NextResponse.json(updated);
}
