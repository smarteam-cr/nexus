import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { KnowledgeStatus, KnowledgeType, TagCategory } from "@prisma/client";

// GET cacheable con ISR 60s. POST (mutación) es siempre dynamic.
// Tras un POST, llamar revalidatePath("/knowledge") y revalidateTag si aplica.
export const revalidate = 60;

// GET /api/knowledge-docs — listar documentos con filtros opcionales
export async function GET(req: NextRequest) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type   = searchParams.get("type")   as KnowledgeType   | null;
  const status = searchParams.get("status") as KnowledgeStatus | null;
  const tagId  = searchParams.get("tagId");

  const docs = await prisma.knowledgeDocument.findMany({
    where: {
      ...(type   ? { type }   : {}),
      ...(status ? { status } : {}),
      ...(tagId  ? { tags: { some: { id: tagId } } } : {}),
    },
    include: { tags: true },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(docs);
}

// POST /api/knowledge-docs — crear documento
export async function POST(req: NextRequest) {
  try {
    await requireConsultantSession();
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = (await req.json()) as {
    type?: string;
    status?: string;
    title?: string;
    summary?: string;
    content?: string;
    tagIds?: string[];
    newTags?: { category: string; value: string; label: string }[];
  };

  if (!body.title?.trim() || !body.content?.trim() || !body.type) {
    return NextResponse.json({ error: "type, title y content son requeridos" }, { status: 400 });
  }

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

  const doc = await prisma.knowledgeDocument.create({
    data: {
      type:            body.type    as KnowledgeType,
      status:          (body.status as KnowledgeStatus) ?? "DRAFT",
      title:           body.title.trim(),
      summary:         body.summary?.trim() ?? null,
      content:         body.content.trim(),
      createdByEmail:  null,
      tags:            allTagIds.length > 0 ? { connect: allTagIds.map((id) => ({ id })) } : undefined,
    },
    include: { tags: true },
  });

  return NextResponse.json(doc, { status: 201 });
}
