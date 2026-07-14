/**
 * /api/projects/[projectId]/publish-desarrollo
 *
 * "Compartir" el canvas Desarrollo (requerimiento técnico) con un DEV externo —
 * SEPARADO del acceso (token+password). El dev solo ve /external/desarrollo cuando
 * `Project.desarrolloPublishedAt != null`. GATE de seguridad: el token de acceso es
 * por proyecto y se comparte con el cliente (kickoff), así que sin este flag el cliente
 * vería el requerimiento interno.
 *
 *   GET    → { published, publishedAt }
 *   POST   → compartir     (desarrolloPublishedAt = now)
 *   DELETE → dejar de compartir (desarrolloPublishedAt = null)
 *
 * A diferencia del kickoff NO hay snapshot: la vista externa lee el canvas VIVO. Guarded
 * con guardAccessToProject — solo quien tiene acceso al proyecto comparte/deja de compartir.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      desarrolloPublishedAt: true,
      // El link del dev reusa el MISMO token de acceso externo del proyecto,
      // aterrizando en /external/desarrollo vía ?next (whitelist en VerifyForm).
      externalAccess: { select: { accessToken: true, revokedAt: true } },
    },
  });
  if (!project) return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });

  // Link solo si hay acceso externo vigente (sin él, el dev no puede verificar).
  const access = project.externalAccess;
  let devUrl: string | null = null;
  if (access && !access.revokedAt) {
    const base = process.env.APP_URL || new URL(req.url).origin;
    devUrl = `${base}/external/verify/${access.accessToken}?next=desarrollo`;
  }

  return NextResponse.json({
    published: !!project.desarrolloPublishedAt,
    publishedAt: project.desarrolloPublishedAt?.toISOString() ?? null,
    devUrl,
    hasAccess: !!access && !access.revokedAt,
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { desarrolloPublishedAt: new Date() },
    select: { desarrolloPublishedAt: true },
  });
  return NextResponse.json({
    published: true,
    publishedAt: updated.desarrolloPublishedAt?.toISOString() ?? null,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  await prisma.project.update({
    where: { id: projectId },
    data: { desarrolloPublishedAt: null },
    select: { id: true },
  });
  return NextResponse.json({ published: false, publishedAt: null });
}
