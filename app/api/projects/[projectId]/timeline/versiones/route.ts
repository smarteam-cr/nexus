/**
 * GET /api/projects/[projectId]/timeline/versiones — el historial de versiones del cronograma (21 nov,
 * lib/timeline/historial-del-cronograma-server.ts): las fotos que ya guardaba cada cambio con motivo y cada publicación,
 * con cuál es la actual y cuál ve el cliente, y el cronograma de hoy (`actual`). Solo lee.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { historialDelCronograma } from "@/lib/timeline/historial-del-cronograma-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const h = await historialDelCronograma(projectId);
  if (!h) return NextResponse.json({ error: "Este proyecto todavía no tiene cronograma." }, { status: 404 });
  return NextResponse.json(h);
}
