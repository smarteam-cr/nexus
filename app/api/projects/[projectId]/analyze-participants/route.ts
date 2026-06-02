import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { analyzeProjectParticipants } from "@/lib/projects/analyze-participants";

/**
 * POST /api/projects/[projectId]/analyze-participants
 *
 * Dispara el agente de análisis de participantes para el proyecto. Sobreescribe
 * el último snapshot si existe.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const result = await analyzeProjectParticipants(projectId);
  return NextResponse.json(result, {
    status: result.status === "error" ? 500 : 200,
  });
}
