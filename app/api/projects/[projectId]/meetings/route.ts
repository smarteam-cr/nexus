import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { isProjectHot, HOT_THRESHOLD, HOT_WINDOW_DAYS } from "@/lib/projects/heat";

/**
 * GET /api/projects/[projectId]/meetings
 *
 * Devuelve toda la data agregada que necesita el tab "Reuniones" del proyecto:
 *   - lastMinute: la SessionMinute más reciente de una sesión asignada al proyecto
 *   - actionItems: ActionItems pendientes del proyecto, agrupados por sesión
 *   - cardRuns: AgentRuns con sourceSessionIds que generaron cards
 *   - history: timeline cronológico de SessionProject del proyecto
 *   - isHot: flag de proactividad (F4)
 *   - participantSnapshot: el último snapshot de análisis de participantes (F5)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      clientId: true,
      serviceType: true,
      client: { select: { id: true, name: true } },
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
  }

  // 1. Sesiones del proyecto (vía SessionProject) — cronológico desc.
  //    Nota: NO traer transcript (pesado). Se chequea aparte vía query de IDs.
  const sessionLinks = await prisma.sessionProject.findMany({
    where: { projectId },
    select: {
      sessionId: true,
      isPrimary: true,
      source: true,
      confidence: true,
      session: {
        select: {
          id: true,
          title: true,
          date: true,
          duration: true,
          participants: true,
          detectedTopics: true,
          minute: {
            select: { id: true, status: true, summary: true, reviewedAt: true },
          },
        },
      },
    },
    orderBy: { session: { date: "desc" } },
  });

  // Set de session IDs con transcript ≥200 chars (sin traer el blob)
  const sessionIds = sessionLinks.map((l) => l.session.id);
  const sessionsWithTranscript =
    sessionIds.length > 0
      ? await prisma.firefliesSession.findMany({
          where: { id: { in: sessionIds }, transcript: { not: null } },
          select: { id: true },
        })
      : [];
  const hasTranscriptSet = new Set(sessionsWithTranscript.map((s) => s.id));

  // Sesión primaria más reciente con minuta
  const lastWithMinute = sessionLinks
    .filter((l) => l.isPrimary && l.session.minute)
    .map((l) => l.session)
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

  let lastMinute: {
    sessionId: string;
    sessionTitle: string;
    sessionDate: string;
    minute: {
      id: string;
      status: string;
      summary: string;
      agreements: unknown;
      decisions: unknown;
      risks: unknown;
      topics: unknown;
      reviewedAt: string | null;
    };
  } | null = null;

  if (lastWithMinute) {
    const full = await prisma.sessionMinute.findUnique({
      where: { sessionId: lastWithMinute.id },
      select: {
        id: true,
        status: true,
        summary: true,
        agreements: true,
        decisions: true,
        risks: true,
        topics: true,
        reviewedAt: true,
      },
    });
    if (full) {
      lastMinute = {
        sessionId: lastWithMinute.id,
        sessionTitle: lastWithMinute.title,
        sessionDate: lastWithMinute.date.toISOString(),
        minute: {
          ...full,
          reviewedAt: full.reviewedAt?.toISOString() ?? null,
        },
      };
    }
  }

  // 2. Sesión más reciente del proyecto SIN minuta (para auto-trigger del loader)
  const latestSessionWithTranscript = sessionLinks
    .filter((l) => hasTranscriptSet.has(l.session.id))
    .map((l) => l.session)
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0];

  const latestSessionWithoutMinute =
    latestSessionWithTranscript && !latestSessionWithTranscript.minute
      ? {
          id: latestSessionWithTranscript.id,
          title: latestSessionWithTranscript.title,
          date: latestSessionWithTranscript.date.toISOString(),
        }
      : null;

  // 3. Historial timeline
  const history = sessionLinks.map((l) => ({
    sessionId: l.session.id,
    title: l.session.title,
    date: l.session.date.toISOString(),
    duration: l.session.duration,
    participants: l.session.participants,
    detectedTopics: l.session.detectedTopics,
    isPrimary: l.isPrimary,
    source: l.source,
    confidence: l.confidence,
    hasTranscript: hasTranscriptSet.has(l.session.id),
    minuteStatus: l.session.minute?.status ?? null,
  }));

  // 4. Heat + participant snapshot
  const [hot, participantSnapshot] = await Promise.all([
    isProjectHot(projectId),
    prisma.projectParticipantSnapshot.findUnique({
      where: { projectId },
      select: { stats: true, sessionsAnalyzed: true, updatedAt: true },
    }),
  ]);

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      clientId: project.clientId,
      clientName: project.client.name,
      serviceType: project.serviceType,
    },
    lastMinute,
    latestSessionWithoutMinute,
    history,
    isHot: hot,
    hotConfig: { threshold: HOT_THRESHOLD, windowDays: HOT_WINDOW_DAYS },
    participantSnapshot: participantSnapshot
      ? {
          stats: participantSnapshot.stats,
          sessionsAnalyzed: participantSnapshot.sessionsAnalyzed,
          updatedAt: participantSnapshot.updatedAt.toISOString(),
        }
      : null,
  });
}
