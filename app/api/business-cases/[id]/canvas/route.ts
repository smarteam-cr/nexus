/**
 * GET /api/business-cases/[id]/canvas[?version=N]
 *
 * Devuelve el canvas del business case (la versión activa, o la pedida) con sus
 * secciones + bloques, y la lista de versiones. Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const versionParam = new URL(req.url).searchParams.get("version");

  const canvases = await prisma.projectCanvas.findMany({
    where: { businessCaseId: id },
    orderBy: { version: "desc" },
    select: { id: true, version: true, isActive: true, createdAt: true },
  });
  if (canvases.length === 0) {
    return NextResponse.json({ canvas: null, versions: [], sections: [] });
  }

  const target = versionParam
    ? canvases.find((c) => String(c.version) === versionParam)
    : canvases.find((c) => c.isActive) ?? canvases[0];
  if (!target) {
    return NextResponse.json({ canvas: null, versions: canvases, sections: [] });
  }

  const sections = await prisma.canvasSection.findMany({
    where: { canvasId: target.id },
    orderBy: { order: "asc" },
    include: {
      blocks: {
        orderBy: { order: "asc" },
        select: { id: true, blockType: true, content: true, data: true, status: true, source: true, order: true },
      },
    },
  });

  return NextResponse.json({
    canvas: { id: target.id, version: target.version, isActive: target.isActive },
    versions: canvases.map((c) => ({ version: c.version, isActive: c.isActive })),
    sections,
  });
}
