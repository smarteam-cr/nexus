import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (_req, { params }: Params) => {
  try {
    const { id } = await params;
    const entry = await prisma.knowledge.findUnique({ where: { id } });
    if (!entry) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(entry);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 401 });
  }
});

export const PUT = withAuth(async (request, { params }: Params) => {
  try {
    const { id } = await params;
    const { title, content, category } = (await request.json()) as {
      title?: string;
      content?: string;
      category?: string;
    };

    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json({ error: "Título y contenido son requeridos" }, { status: 400 });
    }

    const entry = await prisma.knowledge.update({
      where: { id },
      data: {
        title: title.trim(),
        content: content.trim(),
        ...(category ? { category } : {}),
      },
    });

    return NextResponse.json(entry);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

export const DELETE = withAuth(async (_req, { params }: Params) => {
  try {
    const { id } = await params;
    await prisma.knowledge.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
