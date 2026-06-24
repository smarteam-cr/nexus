import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, denyHandoffCanvasEditForCse } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { touchCanvasContent } from "@/lib/canvas/touch-content";

type Params = Promise<{ projectId: string; sectionId: string }>;

// Json null en Prisma necesita DbNull (no el literal null). Para escribir un valor Json
// que puede venir null (al guardar previous*/undo), normalizamos.
const jsonInput = (v: Prisma.JsonValue | null | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  v === null || v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue);

// RBAC: nombre del canvas dueño de una sección (para gatear edición del "Handoff").
async function canvasNameOfSection(sectionId: string): Promise<string> {
  const s = await prisma.canvasSection.findUnique({
    where: { id: sectionId },
    select: { canvas: { select: { name: true } } },
  });
  return s?.canvas.name ?? "";
}

// POST: create a block manually
export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { projectId, sectionId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const denied = await denyHandoffCanvasEditForCse(await canvasNameOfSection(sectionId));
  if (denied) return denied;

  const { blockType, content, data } = await req.json();

  const maxOrder = await prisma.canvasBlock.aggregate({
    where: { sectionId },
    _max: { order: true },
  });

  const block = await prisma.canvasBlock.create({
    data: {
      sectionId,
      blockType: blockType ?? "TEXT",
      content: content ?? "",
      data: data ?? undefined,
      order: (maxOrder._max.order ?? -1) + 1,
      source: "HUMAN",
      status: "CONFIRMED",
    },
  });

  await touchCanvasContent(sectionId);
  return NextResponse.json(block, { status: 201 });
}

// PUT: update block content/data or accept/reject draft
export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { projectId, sectionId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const denied = await denyHandoffCanvasEditForCse(await canvasNameOfSection(sectionId));
  if (denied) return denied;

  const body = await req.json();

  if (!body.blockId) {
    return NextResponse.json({ error: "blockId required" }, { status: 400 });
  }

  const block = await prisma.canvasBlock.findFirst({
    where: { id: body.blockId, sectionId },
  });

  if (!block) {
    return NextResponse.json({ error: "block not found" }, { status: 404 });
  }

  // ── Deshacer de 1 nivel: intercambia content/data con previous* (toggle). ─────
  if (body.undo === true) {
    const updated = await prisma.canvasBlock.update({
      where: { id: body.blockId },
      data: {
        content: block.previousContent,
        data: jsonInput(block.previousData),
        previousContent: block.content,
        previousData: jsonInput(block.data),
      },
    });
    await touchCanvasContent(sectionId);
    return NextResponse.json(updated);
  }

  const updateData: Record<string, unknown> = {};
  // Al editar contenido/datos, guardar el valor ACTUAL en previous* (habilita "Deshacer").
  if ("content" in body || "data" in body) {
    updateData.previousContent = block.content;
    updateData.previousData = jsonInput(block.data);
  }
  if ("content" in body) updateData.content = body.content;
  if ("data" in body) updateData.data = body.data;
  if ("status" in body) updateData.status = body.status;
  if ("colSpan" in body) updateData.colSpan = Math.min(4, Math.max(1, Number(body.colSpan)));
  if ("colStart" in body) updateData.colStart = body.colStart === null ? null : Math.min(4, Math.max(1, Number(body.colStart)));
  if ("rowSpan" in body) updateData.rowSpan = Math.max(1, Number(body.rowSpan));

  // Si el CSE edita contenido/datos de un bloque generado por IA, marcarlo
  // MODIFIED (señal para el agente de kickoff: "esto lo tocó un humano, respetalo").
  // Replica el patrón del PUT de /timeline con TimelinePhase. Cambios de solo
  // status (aceptar/rechazar) NO tocan source.
  if (("content" in body || "data" in body) && block.source === "AGENT") {
    updateData.source = "MODIFIED";
  }

  const updated = await prisma.canvasBlock.update({
    where: { id: body.blockId },
    data: updateData,
  });

  await touchCanvasContent(sectionId);
  return NextResponse.json(updated);
}

// DELETE: remove a block
export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  const { projectId, sectionId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const denied = await denyHandoffCanvasEditForCse(await canvasNameOfSection(sectionId));
  if (denied) return denied;

  const { blockId } = await req.json();

  if (!blockId) {
    return NextResponse.json({ error: "blockId required" }, { status: 400 });
  }

  await prisma.canvasBlock.deleteMany({
    where: { id: blockId, sectionId },
  });

  await touchCanvasContent(sectionId);
  return NextResponse.json({ ok: true });
}
