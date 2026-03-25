import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Mapeo de serviceType a Hub tag
const SERVICE_TO_HUB: Record<string, string> = {
  loop_marketing: "Marketing Hub",
  loop_sales: "Sales Hub",
  loop_service: "Service Hub",
};

// GET: obtener tags del proyecto (auto-detecta desde serviceType si vacío)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tags: true, serviceType: true },
  });

  if (!project) {
    return NextResponse.json({ tags: [] });
  }

  let tags = project.tags ?? [];

  // Si no hay tags pero hay serviceType, auto-asignar
  if (tags.length === 0 && project.serviceType) {
    const hub = SERVICE_TO_HUB[project.serviceType];
    if (hub) {
      tags = [hub];
      // Persistir para no recalcular
      await prisma.project.update({
        where: { id: projectId },
        data: { tags },
      });
    }
  }

  return NextResponse.json({ tags });
}

// PUT: actualizar tags del proyecto
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const { tags } = await req.json();

  if (!Array.isArray(tags)) {
    return NextResponse.json({ error: "tags must be an array" }, { status: 400 });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { tags },
  });

  return NextResponse.json({ ok: true });
}
