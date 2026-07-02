/**
 * /api/projects/[projectId]/client-logo  (GET)
 *
 * Devuelve el logo del cliente del proyecto + los logos de PLATAFORMA (HubSpot /
 * Insider One, config global según tags del proyecto) → { logoUrl, platformLogos }.
 * Lo consume el PREVIEW INTERNO del Kickoff (KickoffLandingInternal) para mostrar
 * el mismo chip que ve el cliente externo, sin tener que publicar.
 * Guarded con guardAccessToProject.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getBrandLogos, platformLogosFor } from "@/lib/external/smarteam-logo";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const [client, project, brandLogos] = await Promise.all([
    prisma.client.findUnique({ where: { id: guard.clientId }, select: { logoUrl: true } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { tags: true } }),
    getBrandLogos(),
  ]);
  return NextResponse.json({
    logoUrl: client?.logoUrl ?? null,
    platformLogos: platformLogosFor(project?.tags ?? [], brandLogos),
  });
}
