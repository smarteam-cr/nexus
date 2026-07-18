import { requireConsultantSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import {
  categorizeSession,
  buildInternalDomainsSet,
  type CategorizeContext,
} from "@/lib/sessions/categorize";
import SessionView, { type SessionViewData } from "./SessionView";

export const dynamic = "force-dynamic";

/**
 * Vista unificada de UNA reunión: combina transcript + minuta + acciones +
 * cards generadas + prep (si futura). Es el corazón del flujo del CSE.
 */
export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const { id } = await params;

  // 1. Cargar la sesión + minuta + acciones + asignaciones de proyecto (paralelo)
  const [session, minute, actionItems, agentRuns, clients, categories, projectAssignments] =
    await Promise.all([
      prisma.firefliesSession.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          date: true,
          duration: true,
          participants: true,
          summary: true,
          transcript: true,
          enrichedAt: true,
          source: true,
          googleDocId: true,
          organizerEmail: true,
          manualClientId: true,
        },
      }),
      prisma.sessionMinute.findUnique({
        where: { sessionId: id },
        select: {
          id: true,
          summary: true,
          agreements: true,
          decisions: true,
          risks: true,
          topics: true,
          status: true,
          reviewedAt: true,
          reviewedByEmail: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.actionItem.findMany({
        where: { sessionId: id },
        orderBy: [{ done: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
        select: {
          id: true,
          text: true,
          ownerEmail: true,
          dueDate: true,
          status: true,
          done: true,
          source: true,
          createdAt: true,
        },
      }),
      // Cards generadas por agentes que usaron esta sesión como input
      prisma.agentRun.findMany({
        where: { sourceSessionIds: { has: id } },
        select: {
          id: true,
          createdAt: true,
          agent: { select: { name: true } },
          cards: {
            select: {
              id: true,
              title: true,
              content: true,
              canvasSection: true,
            },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.client.findMany({
        select: { id: true, name: true, company: true, emailDomains: true },
      }),
      prisma.sessionCategory.findMany({
        select: { id: true, name: true, slug: true, domains: true, kind: true, color: true },
      }),
      // F3-C: asignaciones SessionProject para esta sesión
      prisma.sessionProject.findMany({
        where: { sessionId: id },
        orderBy: [{ isPrimary: "desc" }, { confidence: "desc" }],
        select: {
          projectId: true,
          isPrimary: true,
          source: true,
          confidence: true,
          rationale: true,
          project: {
            select: { id: true, name: true, serviceType: true, clientId: true },
          },
        },
      }),
    ]);

  if (!session) notFound();

  // 2. Resolver cliente matched (vía categorize cascade)
  const ctx: CategorizeContext = {
    clients,
    categories,
    hubspotCompaniesByDomain: new Map(),
    internalDomains: buildInternalDomainsSet(categories),
  };
  const group = categorizeSession(
    {
      participants: session.participants,
      manualClientId: session.manualClientId,
      title: session.title,
    },
    ctx,
  );
  const matchedClient =
    group.kind === "client" ? clients.find((c) => c.id === group.id) ?? null : null;

  // 3. Cargar TeamMembers para selector de owner
  const teamMembers = await prisma.teamMember.findMany({
    where: { deactivatedAt: null }, // selector de owner: solo miembros activos
    select: { email: true, name: true, area: true },
    orderBy: [{ area: "asc" }, { name: "asc" }],
  });

  // 4. Proyectos del cliente matched (para el selector de override manual)
  const availableProjects = matchedClient
    ? await prisma.project.findMany({
        where: {
          clientId: matchedClient.id,
          status: "active",
          serviceType: { not: "__strategy__" },
        },
        select: { id: true, name: true, serviceType: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const data: SessionViewData = {
    session: {
      id: session.id,
      title: session.title,
      date: session.date.toISOString(),
      duration: session.duration,
      participants: session.participants,
      transcript: session.transcript,
      googleDocId: session.googleDocId,
      organizerEmail: session.organizerEmail,
      source: session.source,
      summary: session.summary as { overview?: string } | null,
    },
    client: matchedClient
      ? { id: matchedClient.id, name: matchedClient.name, company: matchedClient.company }
      : null,
    minute: minute
      ? {
          id: minute.id,
          summary: minute.summary,
          agreements: (minute.agreements as { text: string }[] | null) ?? [],
          decisions: (minute.decisions as { text: string; rationale?: string }[] | null) ?? [],
          risks:
            (minute.risks as { text: string; severity?: "low" | "med" | "high" }[] | null) ?? [],
          topics: (minute.topics as string[] | null) ?? [],
          status: minute.status,
          reviewedAt: minute.reviewedAt?.toISOString() ?? null,
          reviewedByEmail: minute.reviewedByEmail,
          updatedAt: minute.updatedAt.toISOString(),
        }
      : null,
    actionItems: actionItems.map((a) => ({
      id: a.id,
      text: a.text,
      ownerEmail: a.ownerEmail,
      dueDate: a.dueDate?.toISOString() ?? null,
      status: a.status,
      done: a.done,
      source: a.source,
      createdAt: a.createdAt.toISOString(),
    })),
    cardsBySource: agentRuns
      .filter((r) => r.cards.length > 0)
      .map((r) => ({
        runId: r.id,
        agentName: r.agent?.name ?? "Agente",
        ranAt: r.createdAt.toISOString(),
        cards: r.cards.map((c) => ({
          id: c.id,
          title: c.title,
          content: c.content,
          canvasSection: c.canvasSection,
        })),
      })),
    // El componente espera `role` (label de área para mostrar) — alimentado desde `area`.
    teamMembers: teamMembers.map((m) => ({ email: m.email, name: m.name, role: m.area })),
    // F3-C: asignaciones a proyecto + lista de proyectos disponibles
    projectAssignments: projectAssignments.map((a) => ({
      projectId: a.projectId,
      projectName: a.project.name,
      serviceType: a.project.serviceType,
      isPrimary: a.isPrimary,
      source: a.source,
      confidence: a.confidence,
      rationale: a.rationale,
    })),
    availableProjects: availableProjects.map((p) => ({
      id: p.id,
      name: p.name,
      serviceType: p.serviceType,
    })),
  };

  return (
    <SessionView data={data} />
  );
}
