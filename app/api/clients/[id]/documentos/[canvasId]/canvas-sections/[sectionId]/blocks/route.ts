/**
 * /api/clients/[id]/documentos/[canvasId]/canvas-sections/[sectionId]/blocks — los bloques de una sección de un
 * documento de la EMPRESA (R3 etapa 3, 2026-10-27). Espejo de la de proyecto (mismos esquemas y el deshacer de un nivel),
 * sin restaurar un bloque borrado ni corridas del agente: este documento se escribe a mano.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { BlockStatus, BlockType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { touchCanvasContent } from "@/lib/canvas/touch-content";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardDocumentoDeLaEmpresa, seccionDelDocumento } from "@/lib/clients/documento-de-la-empresa-guard";

type Params = { params: Promise<{ id: string; canvasId: string; sectionId: string }> };

const datosDeBloque = z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length <= 1_000_000, { message: "data supera 1 MB" });
const postBloque = z.strictObject({
  blockType: z.enum(BlockType).optional(),
  content: z.string().max(200_000).nullable().optional(),
  data: datosDeBloque.nullable().optional(),
});
const putBloque = z.strictObject({
  blockId: z.string().min(1).max(64),
  undo: z.boolean().optional(),
  content: z.string().max(200_000).nullable().optional(),
  data: datosDeBloque.nullable().optional(),
  status: z.enum(BlockStatus).optional(),
  colSpan: z.number().int().min(1).max(4).optional(),
  colStart: z.number().int().min(1).max(4).nullable().optional(),
  rowSpan: z.number().int().min(1).max(40).optional(),
});
const deleteBloque = z.strictObject({ blockId: z.string().min(1).max(64) });

const jsonInput = (v: Prisma.JsonValue | null | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  v === null || v === undefined ? Prisma.DbNull : (v as Prisma.InputJsonValue);

const sinSeccion = () => NextResponse.json({ error: "Sección no encontrada" }, { status: 404 });

export async function POST(req: NextRequest, { params }: Params) {
  const { id, canvasId, sectionId } = await params;
  // La empresa, el documento de la empresa y la sección de ese documento.
  const doc = await guardDocumentoDeLaEmpresa(id, canvasId);
  if (doc instanceof NextResponse) return doc;
  if (!(await seccionDelDocumento(canvasId, sectionId))) return sinSeccion();
  const cuerpo = postBloque.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  const max = await prisma.canvasBlock.aggregate({ where: { sectionId }, _max: { order: true } });
  const block = await prisma.canvasBlock.create({
    data: {
      sectionId,
      blockType: cuerpo.data.blockType ?? "TEXT",
      content: cuerpo.data.content ?? "",
      data: (cuerpo.data.data ?? undefined) as Prisma.InputJsonValue | undefined,
      order: (max._max.order ?? -1) + 1,
      source: "HUMAN",
      status: "CONFIRMED",
    },
  });
  await touchCanvasContent(sectionId);
  return NextResponse.json(block, { status: 201 });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id, canvasId, sectionId } = await params;
  // La empresa, el documento de la empresa y la sección de ese documento.
  const doc = await guardDocumentoDeLaEmpresa(id, canvasId);
  if (doc instanceof NextResponse) return doc;
  if (!(await seccionDelDocumento(canvasId, sectionId))) return sinSeccion();
  const cuerpo = putBloque.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  const body = cuerpo.data;
  const block = await prisma.canvasBlock.findFirst({ where: { id: body.blockId, sectionId } });
  if (!block) return NextResponse.json({ error: "block not found" }, { status: 404 });

  if (body.undo === true) {
    const updated = await prisma.canvasBlock.update({
      where: { id: body.blockId },
      data: { content: block.previousContent, data: jsonInput(block.previousData), previousContent: block.content, previousData: jsonInput(block.data) },
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
  if ("data" in body) updateData.data = jsonInput(body.data as Prisma.JsonValue | null | undefined);
  if ("status" in body) updateData.status = body.status;
  if ("colSpan" in body) updateData.colSpan = body.colSpan;
  if ("colStart" in body) updateData.colStart = body.colStart;
  if ("rowSpan" in body) updateData.rowSpan = body.rowSpan;
  if (("content" in body || "data" in body) && block.source === "AGENT") updateData.source = "MODIFIED";
  const updated = await prisma.canvasBlock.update({ where: { id: body.blockId }, data: updateData });
  await touchCanvasContent(sectionId);
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { id, canvasId, sectionId } = await params;
  // La empresa, el documento de la empresa y la sección de ese documento.
  const doc = await guardDocumentoDeLaEmpresa(id, canvasId);
  if (doc instanceof NextResponse) return doc;
  if (!(await seccionDelDocumento(canvasId, sectionId))) return sinSeccion();
  const cuerpo = deleteBloque.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  await prisma.canvasBlock.deleteMany({ where: { id: cuerpo.data.blockId, sectionId } });
  await touchCanvasContent(sectionId);
  return NextResponse.json({ ok: true });
}
