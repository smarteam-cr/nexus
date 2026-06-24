import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { classifyHandoffSession } from "@/lib/handoff/session-relevance";

/**
 * GET /api/projects/[projectId]/session-candidates
 *
 * Selección revisable de sesiones del handoff (A2). Una sesión "alimenta el handoff" si es
 * de VENTA — por título (discovery/demo/cierre/proceso comercial…) O porque participó
 * Ventas en la sala (mismo criterio que la generación en analyze, vía
 * lib/handoff/session-relevance). Las de entrega/CS no alimentan.
 * Devuelve:
 *   - linked: TODAS las sesiones clasificadas a este proyecto, con flag `feedsHandoff`
 *     (las que no alimentan se muestran en gris, no se ocultan).
 *   - candidates: sesiones del cliente que alimentarían el handoff y NO están linkeadas.
 *
 * Solo lectura. Incluir/excluir va por /api/sessions/[id]/projects (POST/DELETE).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const { clientId } = guard;

  // Emails del equipo de Ventas (misma fuente que analyze: area Sales/Ventas).
  const salesTeam = await prisma.teamMember.findMany({
    where: { area: { in: ["Sales", "Ventas"] } },
    select: { email: true },
  });
  const salesEmails = new Set(salesTeam.map((m) => m.email.toLowerCase()));
  const feeds = (title: string, participants: string[], organizerEmail: string | null): boolean =>
    classifyHandoffSession(title, participants, organizerEmail, salesEmails).include;

  const linkedRows = await prisma.sessionProject.findMany({
    where: { projectId },
    orderBy: [{ isPrimary: "desc" }, { confidence: "desc" }],
    select: {
      isPrimary: true,
      source: true,
      confidence: true,
      rationale: true,
      session: {
        select: { id: true, title: true, date: true, participants: true, organizerEmail: true },
      },
    },
  });

  // TODAS las linkeadas (para ver qué clasificó el agente), marcando cuáles alimentan
  // el handoff. Las que no alimentan se muestran en gris en la UI.
  const linked = linkedRows.map((r) => ({
    sessionId: r.session.id,
    title: r.session.title,
    date: r.session.date,
    participants: r.session.participants,
    isPrimary: r.isPrimary,
    source: r.source,
    confidence: r.confidence,
    rationale: r.rationale,
    feedsHandoff: feeds(r.session.title, r.session.participants, r.session.organizerEmail),
  }));

  const linkedIds = linkedRows.map((r) => r.session.id);

  // Candidatas: sesiones del cliente que ALIMENTARÍAN el handoff y no están linkeadas.
  const candidateRows = await prisma.firefliesSession.findMany({
    where: {
      resolvedClientId: clientId,
      date: { lte: new Date() },
      id: { notIn: linkedIds },
    },
    orderBy: { date: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      date: true,
      participants: true,
      organizerEmail: true,
      projects: { select: { projectId: true } },
    },
  });

  const candidates = candidateRows
    .filter((s) => feeds(s.title, s.participants, s.organizerEmail))
    .slice(0, 50)
    .map((s) => ({
      sessionId: s.id,
      title: s.title,
      date: s.date,
      participants: s.participants,
      linkedElsewhere: s.projects.length > 0,
    }));

  return NextResponse.json({ linked, candidates });
}
