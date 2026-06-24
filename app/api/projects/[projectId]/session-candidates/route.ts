import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/projects/[projectId]/session-candidates
 *
 * Selección revisable de sesiones del handoff (A2). El handoff es Sales→CS: SOLO
 * cuentan las sesiones donde participó alguien de VENTAS (mismo criterio que la
 * generación en analyze: TeamMember.area ∈ {Sales, Ventas}). Las de CS/entrega
 * (kickoff, implementación, marketing) quedan fuera aunque estén linkeadas al proyecto.
 * Devuelve:
 *   - linked: sesiones de Ventas YA clasificadas a este proyecto (con rationale/source).
 *   - candidates: otras sesiones de Ventas del cliente NO linkeadas, para agregar.
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
  const hasSales = (participants: string[], organizerEmail: string | null): boolean => {
    const all = organizerEmail ? [...participants, organizerEmail] : participants;
    return all.some((p) => salesEmails.has(p.toLowerCase()));
  };

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

  const linked = linkedRows
    .filter((r) => hasSales(r.session.participants, r.session.organizerEmail))
    .map((r) => ({
      sessionId: r.session.id,
      title: r.session.title,
      date: r.session.date,
      participants: r.session.participants,
      isPrimary: r.isPrimary,
      source: r.source,
      confidence: r.confidence,
      rationale: r.rationale,
    }));

  // Excluir de candidatas TODAS las ya linkeadas (incl. las de CS), no solo las de ventas.
  const linkedIds = linkedRows.map((r) => r.session.id);

  // Candidatas: sesiones del cliente (resolvedClientId) NO linkeadas a este proyecto,
  // pasadas, con Ventas en la sala. Traemos un set amplio y filtramos a las de ventas.
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
    .filter((s) => hasSales(s.participants, s.organizerEmail))
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
