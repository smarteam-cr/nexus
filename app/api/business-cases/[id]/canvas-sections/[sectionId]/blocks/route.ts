/**
 * Bloques de una sección del canvas de un business case (contrato del hook
 * useCanvasSections; espejo de /api/projects/[projectId]/canvas-sections/[sectionId]/blocks).
 *   POST   → crear bloque manual (HUMAN/CONFIRMED)
 *   PUT    → editar content/data o aceptar/rechazar (status), con undo de 1 nivel
 *   DELETE → eliminar bloque
 * Gateado con guardSalesAccess + pertenencia al caso. SIN gating de handoff.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { touchCanvasContent } from "@/lib/canvas/touch-content";
import { sectionInBusinessCase } from "@/lib/business-cases/canvas-guard";

type Params = Promise<{ id: string; sectionId: string }>;

const jsonInput = (v: Prisma.JsonValue | null | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  v === null || v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue);

async function guardSection(id: string, sectionId: string): Promise<NextResponse | null> {
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;
  if (!(await sectionInBusinessCase(id, sectionId))) {
    return NextResponse.json({ error: "section not found" }, { status: 404 });
  }
  return null;
}

// POST: create a block manually
export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id, sectionId } = await params;
  const denied = await guardSection(id, sectionId);
  if (denied) return denied;

  const { blockType, content, data } = await req.json();

  const maxOrder = await prisma.canvasBlock.aggregate({
    where: { sectionId },
    _max: { order: true },
  });

  const block = await prisma.canvasBlock.create({
    data: {
      sectionId,
      blockType: blockType ?? "CARD",
      content: content ?? null,
      data: data ?? undefined,
      order: (maxOrder._max.order ?? -1) + 1,
      source: "HUMAN",
      status: "CONFIRMED",
    },
  });

  await touchCanvasContent(sectionId);
  return NextResponse.json(block, { status: 201 });
}

// PUT: update block content/data or accept/reject draft (+ undo)
export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { id, sectionId } = await params;
  const denied = await guardSection(id, sectionId);
  if (denied) return denied;

  const body = await req.json();
  if (!body.blockId) {
    return NextResponse.json({ error: "blockId required" }, { status: 400 });
  }

  const block = await prisma.canvasBlock.findFirst({ where: { id: body.blockId, sectionId } });
  if (!block) {
    return NextResponse.json({ error: "block not found" }, { status: 404 });
  }

  // Deshacer de 1 nivel: intercambia content/data con previous* (toggle).
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
  if ("content" in body || "data" in body) {
    updateData.previousContent = block.content;
    updateData.previousData = jsonInput(block.data);
  }
  if ("content" in body) updateData.content = body.content;
  if ("data" in body) updateData.data = body.data;
  if ("status" in body) updateData.status = body.status;
  // Si el vendedor edita contenido/datos de un bloque del agente, marcarlo MODIFIED.
  if (("content" in body || "data" in body) && block.source === "AGENT") {
    updateData.source = "MODIFIED";
  }

  const updated = await prisma.canvasBlock.update({ where: { id: body.blockId }, data: updateData });
  await touchCanvasContent(sectionId);
  return NextResponse.json(updated);
}

// DELETE: remove a block
export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  const { id, sectionId } = await params;
  const denied = await guardSection(id, sectionId);
  if (denied) return denied;

  const { blockId } = await req.json();
  if (!blockId) {
    return NextResponse.json({ error: "blockId required" }, { status: 400 });
  }

  await prisma.canvasBlock.deleteMany({ where: { id: blockId, sectionId } });
  await touchCanvasContent(sectionId);
  return NextResponse.json({ ok: true });
}
