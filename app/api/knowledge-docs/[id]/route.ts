import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { KnowledgeStatus, KnowledgeType, TagCategory } from "@prisma/client";

// GET /api/knowledge-docs/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const doc = await prisma.knowledgeDocument.findUnique({
    where: { id },
    include: { tags: true },
  });

  if (!doc) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(doc);
}

// PUT /api/knowledge-docs/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const body = (await req.json()) as {
    type?: string;
    status?: string;
    title?: string;
    summary?: string;
    content?: string;
    tagIds?: string[];
    newTags?: { category: string; value: string; label: string }[];
  };

  // Crear tags nuevos si vienen
  const createdTagIds: string[] = [];
  for (const nt of body.newTags ?? []) {
    const tag = await prisma.knowledgeTag.upsert({
      where: { category_value: { category: nt.category as TagCategory, value: nt.value } },
      update: { label: nt.label },
      create: { category: nt.category as TagCategory, value: nt.value, label: nt.label },
    });
    createdTagIds.push(tag.id);
  }

  const allTagIds = [...(body.tagIds ?? []), ...createdTagIds];

  const existing = await prisma.knowledgeDocument.findUnique({ where: { id }, select: { version: true } });
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const doc = await prisma.knowledgeDocument.update({
    where: { id },
    data: {
      ...(body.type    ? { type:    body.type    as KnowledgeType }    : {}),
      ...(body.status  ? { status:  body.status  as KnowledgeStatus }  : {}),
      ...(body.title   ? { title:   body.title.trim() }                 : {}),
      summary:         body.summary?.trim() ?? undefined,
      ...(body.content ? { content: body.content.trim() }              : {}),
      version:         existing.version + 1,
      updatedByEmail:  null,
      tags:            { set: allTagIds.map((tid) => ({ id: tid })) },
    },
    include: { tags: true },
  });

  return NextResponse.json(doc);
}

// DELETE /api/knowledge-docs/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  await prisma.knowledgeDocument.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
