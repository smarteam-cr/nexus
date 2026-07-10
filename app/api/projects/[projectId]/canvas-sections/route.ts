import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, denyHandoffCanvasEditForCse } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

// GET: sections + blocks for a non-default canvas
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const canvasId = new URL(req.url).searchParams.get("canvasId");

  if (!canvasId) {
    return NextResponse.json({ error: "canvasId required" }, { status: 400 });
  }

  const canvas = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: { projectId: true, isDefault: true },
  });

  if (!canvas || canvas.projectId !== projectId) {
    return NextResponse.json({ error: "canvas not found" }, { status: 404 });
  }

  const sections = await prisma.canvasSection.findMany({
    where: { canvasId },
    orderBy: { order: "asc" },
    include: {
      blocks: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          blockType: true,
          content: true,
          data: true,
          previousContent: true,
          previousData: true,
          order: true,
          colSpan: true,
          colStart: true,
          rowSpan: true,
          source: true,
          status: true,
          agentRunId: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json({ sections });
}

// PATCH: reorder SECTIONS of a canvas (drag&drop). Espejo del de business-cases;
// el kickoff (editor nuevo sobre LandingView) lo usa vía useCanvasSections.reorderSections.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: { canvasId?: unknown; orderedIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const canvasId = typeof body.canvasId === "string" ? body.canvasId : "";
  // Set (dedup): un id repetido dejaría dos secciones con el mismo `order`.
  const orderedIds = Array.isArray(body.orderedIds)
    ? [...new Set(body.orderedIds.filter((x): x is string => typeof x === "string"))]
    : [];
  if (!canvasId || orderedIds.length === 0) {
    return NextResponse.json({ error: "canvasId y orderedIds requeridos" }, { status: 400 });
  }

  const canvas = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: { projectId: true, name: true },
  });
  if (!canvas || canvas.projectId !== projectId) {
    return NextResponse.json({ error: "canvas not found" }, { status: 404 });
  }
  const denied = await denyHandoffCanvasEditForCse(canvas.name);
  if (denied) return denied;

  // Solo secciones del PROPIO canvas (ids ajenos se ignoran); las no incluidas
  // conservan su posición relativa al final.
  const rows = await prisma.canvasSection.findMany({
    where: { canvasId },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  const valid = new Set(rows.map((r) => r.id));
  const ordered = orderedIds.filter((sid) => valid.has(sid));
  const rest = rows.map((r) => r.id).filter((sid) => !ordered.includes(sid));
  const finalOrder = [...ordered, ...rest];

  await prisma.$transaction(
    finalOrder.map((sid, i) =>
      prisma.canvasSection.update({ where: { id: sid }, data: { order: i } }),
    ),
  );

  // Marca "cambios sin subir" (reordenar cambia lo que se publicará en el snapshot).
  try {
    await prisma.projectCanvas.update({ where: { id: canvasId }, data: { contentUpdatedAt: new Date() } });
  } catch {
    /* flag secundario */
  }

  return NextResponse.json({ ok: true });
}

// PUT: reorder blocks within/between sections
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const { blockId, toSectionId, toIndex } = await req.json();

  if (!blockId || !toSectionId || typeof toIndex !== "number") {
    return NextResponse.json({ error: "blockId, toSectionId, toIndex required" }, { status: 400 });
  }

  const block = await prisma.canvasBlock.findUnique({
    where: { id: blockId },
    include: { section: { select: { canvasId: true, canvas: { select: { projectId: true, name: true } } } } },
  });

  if (!block || block.section.canvas.projectId !== projectId) {
    return NextResponse.json({ error: "block not found" }, { status: 404 });
  }
  const denied = await denyHandoffCanvasEditForCse(block.section.canvas.name);
  if (denied) return denied;

  const fromSectionId = block.sectionId;

  if (fromSectionId === toSectionId) {
    // Reorder within same section
    const sectionBlocks = await prisma.canvasBlock.findMany({
      where: { sectionId: toSectionId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    const ids = sectionBlocks.map((b) => b.id).filter((id) => id !== blockId);
    ids.splice(toIndex, 0, blockId);
    await Promise.all(ids.map((id, i) => prisma.canvasBlock.update({ where: { id }, data: { order: i } })));
  } else {
    // Move to different section
    const fromBlocks = await prisma.canvasBlock.findMany({
      where: { sectionId: fromSectionId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    const fromIds = fromBlocks.map((b) => b.id).filter((id) => id !== blockId);
    await Promise.all(fromIds.map((id, i) => prisma.canvasBlock.update({ where: { id }, data: { order: i } })));

    const toBlocks = await prisma.canvasBlock.findMany({
      where: { sectionId: toSectionId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    const toIds = toBlocks.map((b) => b.id);
    toIds.splice(toIndex, 0, blockId);
    await Promise.all(toIds.map((id, i) =>
      prisma.canvasBlock.update({ where: { id }, data: { sectionId: toSectionId, order: i } })
    ));
  }

  return NextResponse.json({ ok: true });
}
