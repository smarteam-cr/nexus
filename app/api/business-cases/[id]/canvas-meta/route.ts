/**
 * GET /api/business-cases/[id]/canvas-meta
 *
 * Metadatos de versiones del canvas del business case (para el selector de "Casos
 * de uso" del workspace): el canvas activo + la lista de versiones. El contenido
 * se lee aparte por /canvas-sections?canvasId=. Gateado con guardSalesAccess.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const canvases = await prisma.projectCanvas.findMany({
    where: { businessCaseId: id },
    orderBy: { version: "desc" },
    select: { id: true, version: true, isActive: true, name: true },
  });

  const activeCanvasId = canvases.find((c) => c.isActive)?.id ?? canvases[0]?.id ?? null;

  return NextResponse.json({
    activeCanvasId,
    versions: canvases.map((c) => ({
      canvasId: c.id,
      version: c.version,
      isActive: c.isActive,
      name: c.name,
    })),
  });
}
