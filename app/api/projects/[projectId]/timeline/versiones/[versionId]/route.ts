/**
 * GET /api/projects/[projectId]/timeline/versiones/[versionId] — una versión del cronograma, para la vista previa
 * (21 nov). `versionId`: «cambio:<id>» o «base:<id>»; tiene que ser de ESTE proyecto (un id ajeno es un 404).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { cronogramaDeLaVersion } from "@/lib/timeline/historial-del-cronograma-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string; versionId: string }> }) {
  const { projectId, versionId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const cronograma = await cronogramaDeLaVersion(projectId, decodeURIComponent(versionId));
  if (!cronograma) return NextResponse.json({ error: "Versión no encontrada" }, { status: 404 });
  return NextResponse.json({ cronograma });
}
