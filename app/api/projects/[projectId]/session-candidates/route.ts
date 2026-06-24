import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/projects/[projectId]/session-candidates
 *
 * Selección revisable de sesiones del handoff (A2). Devuelve:
 *   - linked: las sesiones YA clasificadas a este proyecto (SessionProject), con su
 *     rationale/confidence/source — para AUDITAR la propuesta del agente y poder podar.
 *   - candidates: otras sesiones del MISMO cliente que NO están en este proyecto, para
 *     agregar alguna que el agente no trajo. `linkedElsewhere` = ya pertenece a otro
 *     proyecto (se muestra pero se avisa).
 *
 * Solo lectura. Incluir/excluir va por /api/sessions/[id]/projects (POST/DELETE), que
 * ya existen y marcan source="manual".
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const { clientId } = guard;

  const linkedRows = await prisma.sessionProject.findMany({
    where: { projectId },
    orderBy: [{ isPrimary: "desc" }, { confidence: "desc" }],
    select: {
      isPrimary: true,
      source: true,
      confidence: true,
      rationale: true,
      session: { select: { id: true, title: true, date: true, participants: true } },
    },
  });

  const linked = linkedRows.map((r) => ({
    sessionId: r.session.id,
    title: r.session.title,
    date: r.session.date,
    participants: r.session.participants,
    isPrimary: r.isPrimary,
    source: r.source,
    confidence: r.confidence,
    rationale: r.rationale,
  }));

  const linkedIds = linked.map((l) => l.sessionId);

  // Candidatas: sesiones del cliente (resolvedClientId materializado) NO linkeadas a este
  // proyecto, solo pasadas, las 50 más recientes. `projects` (relación a SessionProject)
  // sirve para flaggear las que ya están en otro proyecto.
  const candidateRows = await prisma.firefliesSession.findMany({
    where: {
      resolvedClientId: clientId,
      date: { lte: new Date() },
      id: { notIn: linkedIds },
    },
    orderBy: { date: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      date: true,
      participants: true,
      projects: { select: { projectId: true } },
    },
  });

  const candidates = candidateRows.map((s) => ({
    sessionId: s.id,
    title: s.title,
    date: s.date,
    participants: s.participants,
    linkedElsewhere: s.projects.length > 0,
  }));

  return NextResponse.json({ linked, candidates });
}
