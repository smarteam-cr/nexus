import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";
import { prisma } from "@/lib/db/prisma";
import { DocumentType } from "@prisma/client";

type Params = { params: Promise<{ id: string }> };

// GET /api/clients/[id]/documents?stage=1&step=4&projectId=xxx
// stage=global → filtra stage IS NULL (documentos de proyecto)
// sin stage → retorna todos
// projectId → filtra por proyecto
export const GET = withAuth(async (request, { params }: Params) => {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const stageParam = searchParams.get("stage");
    const stepRaw = searchParams.get("step");
    const stepParsed = stepRaw !== null ? parseInt(stepRaw) : NaN;
    const step = !isNaN(stepParsed) ? stepParsed : undefined;
    const projectId = searchParams.get("projectId") ?? undefined;

    let stageFilter: { stage?: number | null } = {};
    if (stageParam === "global") {
      stageFilter = { stage: null };
    } else if (stageParam !== null) {
      const stageParsed = parseInt(stageParam);
      if (isNaN(stageParsed)) return NextResponse.json({ error: "Parámetro stage inválido" }, { status: 400 });
      stageFilter = { stage: stageParsed };
    }

    const documents = await prisma.clientDocument.findMany({
      where: {
        clientId: id,
        ...stageFilter,
        ...(step !== undefined ? { step } : {}),
        ...(projectId !== undefined ? { projectId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(documents);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
});

// POST /api/clients/[id]/documents
// Body: { stage?, step?, title, type, content?, url? }
// stage omitido = documento global del cliente
export const POST = withAuth(async (request, { params }: Params) => {
  try {
    const { id } = await params;
    const { stage, step, projectId, title, type, content, url } = (await request.json()) as {
      stage?: number | null;
      step?: number;
      projectId?: string;
      title: string;
      type: DocumentType;
      content?: string;
      url?: string;
    };

    if (!title || !type) {
      return NextResponse.json({ error: "title y type son requeridos" }, { status: 400 });
    }

    const doc = await prisma.clientDocument.create({
      data: {
        clientId: id,
        stage: stage ?? null,
        step: step ?? null,
        projectId: projectId ?? null,
        title,
        type,
        content: content ?? null,
        url: url ?? null,
      },
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
