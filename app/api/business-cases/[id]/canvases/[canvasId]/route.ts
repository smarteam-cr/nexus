/**
 * DELETE /api/business-cases/[id]/canvases/[canvasId]
 *
 * Borra un CASO DE USO (versión generada, v≥1) del business case. La Plantilla (v0)
 * NO se puede borrar. Si el caso borrado era el activo, activa el más nuevo restante
 * (o la Plantilla si no quedan casos). Cascade → secciones + bloques.
 *
 * Gateado con guardSalesAccess (VENTAS/CSL/SUPER_ADMIN).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; canvasId: string }> },
) {
  const { id, canvasId } = await params;
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const canvas = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: { id: true, version: true, isActive: true, businessCaseId: true },
  });
  if (!canvas || canvas.businessCaseId !== id) {
    return NextResponse.json({ error: "Caso de uso no existe" }, { status: 404 });
  }
  if (canvas.version === 0) {
    return NextResponse.json({ error: "La plantilla no se puede borrar." }, { status: 400 });
  }

  // ¿Quién queda activo? Si borramos el activo, el más nuevo restante (puede ser la
  // Plantilla si no quedan casos). Si borramos uno inactivo, el activo actual sigue.
  let activeCanvasId: string | null;
  if (canvas.isActive) {
    const replacement = await prisma.projectCanvas.findFirst({
      where: { businessCaseId: id, id: { not: canvasId } },
      orderBy: { version: "desc" },
      select: { id: true },
    });
    activeCanvasId = replacement?.id ?? null;
  } else {
    const current = await prisma.projectCanvas.findFirst({
      where: { businessCaseId: id, isActive: true, id: { not: canvasId } },
      select: { id: true },
    });
    activeCanvasId = current?.id ?? null;
  }

  await prisma.projectCanvas.delete({ where: { id: canvasId } });
  if (canvas.isActive && activeCanvasId) {
    await prisma.projectCanvas.update({ where: { id: activeCanvasId }, data: { isActive: true } });
  }

  return NextResponse.json({ ok: true, activeCanvasId });
}
