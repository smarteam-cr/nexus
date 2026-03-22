import { NextRequest, NextResponse } from "next/server";
import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    await requireConsultantSession();
    const entries = await prisma.knowledge.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(entries);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireConsultantSession();
    const { title, content, category } = (await request.json()) as {
      title?: string;
      content?: string;
      category?: string;
    };

    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json({ error: "Título y contenido son requeridos" }, { status: 400 });
    }

    // Obtener la primera cuenta HubSpot disponible (requerido por el schema)
    const account = await prisma.hubspotAccount.findFirst();
    if (!account) {
      return NextResponse.json({ error: "No hay cuenta HubSpot conectada" }, { status: 400 });
    }

    const entry = await prisma.knowledge.create({
      data: {
        accountId: account.id,
        title: title.trim(),
        content: content.trim(),
        category: category ?? "general",
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
