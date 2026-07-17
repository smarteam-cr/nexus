/**
 * GET /api/projects/[projectId]/timeline/publish-suggestion
 *
 * Sugiere la "razón del cambio" para precargar el modal de «Subir al cliente»: diffea la última
 * foto publicada (`publishedSnapshot`) contra la que se va a publicar (`readClientTimeline`) y
 * devuelve una frase determinista ("Se agregó 1 tarea y se hizo visible 1 particularidad.").
 * Solo lectura; guarded con guardAccessToProject (interno).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { readClientTimeline } from "@/lib/external/timeline-view";
import { suggestPublishReason } from "@/lib/timeline/publish-diff";
import type { ExternalTimelineData } from "@/lib/external/timeline-view-types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { publishedSnapshot: true },
  });
  const prev = (tl?.publishedSnapshot as unknown as ExternalTimelineData | null) ?? null;

  let suggestion = "";
  try {
    const next = await readClientTimeline(projectId);
    suggestion = suggestPublishReason(prev, next);
  } catch {
    // best-effort: sin sugerencia si la lectura falla (el modal abre con el textarea vacío).
    suggestion = "";
  }

  return NextResponse.json({ suggestion });
}
