/**
 * /api/projects/[projectId]/client-logo  (GET)
 *
 * Devuelve el logo del cliente del proyecto → { logoUrl }. Lo consume el PREVIEW
 * INTERNO del Kickoff (KickoffLandingInternal) para mostrar el mismo chip que ve
 * el cliente externo, sin tener que publicar. Guarded con guardAccessToProject.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const client = await prisma.client.findUnique({
    where: { id: guard.clientId },
    select: { logoUrl: true },
  });
  return NextResponse.json({ logoUrl: client?.logoUrl ?? null });
}
