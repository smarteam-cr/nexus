import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { classifyHandoffSession } from "@/lib/handoff/session-relevance";
import { belongsToClient } from "@/lib/sessions/project-sources";

/**
 * GET /api/projects/[projectId]/session-candidates
 *
 * Para la selección revisable del handoff (A2 rediseñado). Devuelve:
 *   - feeding: las sesiones que ALIMENTAN el handoff (panel limpio). Una sesión alimenta
 *     si su override es true, o (sin override) si la regla la incluye —título de
 *     handoff/kickoff o Ventas en la sala (lib/handoff/session-relevance). Las override=false
 *     no entran.
 *   - candidates: las DEMÁS sesiones del cliente (pop-up "Buscar más"), con `applies`
 *     (¿la regla la incluiría?) para destacarlas. Agregar una la fuerza al handoff.
 *
 * Solo lectura. Incluir/excluir va por POST /api/projects/[projectId]/handoff-sessions.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const { clientId } = guard;

  const salesTeam = await prisma.teamMember.findMany({
    where: { area: { in: ["Sales", "Ventas"] } },
    select: { email: true },
  });
  const salesEmails = new Set(salesTeam.map((m) => m.email.toLowerCase()));
  const applies = (title: string, participants: string[], organizerEmail: string | null): boolean =>
    classifyHandoffSession(title, participants, organizerEmail, salesEmails).include;

  const linkedRows = await prisma.sessionProject.findMany({
    where: { projectId },
    select: {
      source: true,
      confidence: true,
      rationale: true,
      handoffOverride: true,
      session: {
        select: {
          id: true, title: true, date: true, participants: true, organizerEmail: true,
          resolvedClientId: true, manualClientId: true,
        },
      },
    },
  });

  // Defensa de runtime (chokepoint): descartar links a sesiones que ya NO son de este
  // cliente (stale/legacy/cross-client). El ownership lo manda resolvedClientId/manualClientId.
  const safeRows = linkedRows.filter((r) => belongsToClient(r.session, clientId));
  if (safeRows.length !== linkedRows.length) {
    console.warn(
      `[session-candidates] project=${projectId}: descartados ${linkedRows.length - safeRows.length} link(s) cross-client`,
    );
  }

  // ¿Esta sesión linkeada alimenta el handoff? override gana; sino, la regla.
  const feeds = (r: (typeof linkedRows)[number]): boolean =>
    r.handoffOverride === false
      ? false
      : r.handoffOverride === true
        ? true
        : applies(r.session.title, r.session.participants, r.session.organizerEmail);

  const feeding = safeRows
    .filter(feeds)
    .sort((a, b) => b.session.date.getTime() - a.session.date.getTime())
    .map((r) => ({
      sessionId: r.session.id,
      title: r.session.title,
      date: r.session.date,
      participants: r.session.participants,
      source: r.source,
      confidence: r.confidence,
      rationale: r.rationale,
      forced: r.handoffOverride === true,
    }));
  const feedingIds = new Set(feeding.map((f) => f.sessionId));

  // Candidatas para el pop-up: todas las sesiones del cliente que NO alimentan ya el
  // handoff (incluye las linkeadas-pero-excluidas y las no linkeadas). `applies` marca
  // las que entrarían por regla, para destacarlas arriba.
  const clientSessions = await prisma.firefliesSession.findMany({
    where: { resolvedClientId: clientId, date: { lte: new Date() } },
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

  const candidates = clientSessions
    .filter((s) => !feedingIds.has(s.id))
    .map((s) => ({
      sessionId: s.id,
      title: s.title,
      date: s.date,
      participants: s.participants,
      applies: applies(s.title, s.participants, s.organizerEmail),
      linkedElsewhere: s.projects.some((p) => p.projectId !== projectId),
    }))
    .sort((a, b) => Number(b.applies) - Number(a.applies)); // las que aplican, primero (date ya viene desc)

  return NextResponse.json({ feeding, candidates });
}
