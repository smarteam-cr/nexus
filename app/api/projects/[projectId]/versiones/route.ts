import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { documentoDelProyecto } from "@/lib/canvas/versiones-acceso";

/**
 * GET /api/projects/[projectId]/versiones?canvasId= — las versiones anteriores de un documento
 * (lib/canvas/versiones.ts), las más nuevas primero. Sin el contenido: eso lo trae el detalle.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const canvasId = req.nextUrl.searchParams.get("canvasId") ?? "";
  const canvas = canvasId ? await documentoDelProyecto(projectId, canvasId) : null;
  if (!canvas) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  if (!modeloDisponible(prisma.versionDeDocumento)) return NextResponse.json({ versiones: [] });

  const versiones = await prisma.versionDeDocumento.findMany({
    where: { canvasId },
    orderBy: { createdAt: "desc" },
    select: { id: true, origen: true, creadaPor: true, createdAt: true },
  });
  return NextResponse.json({ versiones });
}
