import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireAccessToClient } from "@/lib/auth/access";
import { requireInternalUser, ForbiddenError, UnauthorizedError, type AppUserWithTeamMember } from "@/lib/auth/supabase";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import { duenoDeLaSesion } from "@/lib/sessions/project-sources";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { cargarTarjeta } from "@/lib/seguimiento/tarjeta-server";
import { tarjetaTieneAlgo } from "@/lib/seguimiento/tarjeta";
import LoQueDejoLaReunion from "@/components/seguimiento/LoQueDejoLaReunion";
import LeerEstaReunion from "@/components/seguimiento/LeerEstaReunion";
import { MIN_TRANSCRIPT_CHARS } from "@/lib/google/doc-parse";
import { contextoDeTareas, tareasDisponible } from "@/lib/tareas/servidor";
import { contarTareasDeLaReunion } from "@/lib/tareas/consultas";
import SessionView, { type SessionViewData } from "./SessionView";

export const dynamic = "force-dynamic";

/**
 * Vista unificada de UNA reunión: combina transcript + minuta + las tareas que dejó +
 * cards generadas + prep (si futura). Es el corazón del flujo del CSE.
 *
 * Desde el 2026-10-09 (memoria de la cuenta, etapa 1):
 *   · el dueño de la reunión es `resolvedClientId` (el manual solo si no hay), sin recategorizar acá;
 *   · con dueño, pide ACCESO a ese cliente: sin acceso, 404 (antes cualquiera del equipo leía cualquier transcripción);
 *   · arriba de las pestañas va «Lo que dejó esta reunión» (lib/seguimiento), si la reunión tiene tarjeta; y «Leer esta
 *     reunión» si todavía no tiene minuta (desde el 2026-10-10).
 * Desde el 2026-10-10 (etapa 2): «N tareas» cuenta las tareas que dejó, de las que ve quien mira (`ActionItem` se retiró).
 */

/** Cuántas tareas dejó la reunión, de las que ve quien mira. Sin las tablas de Tareas (o sin un SQL), 0: la página se ve igual. */
async function tareasQueDejo(sessionId: string, user: AppUserWithTeamMember): Promise<number> {
  if (!user.teamMember || !(await tareasDisponible())) return 0;
  try {
    return await contarTareasDeLaReunion(await contextoDeTareas(user), sessionId);
  } catch (e) {
    if (esquemaDesactualizado(e)) return 0;
    throw e;
  }
}
export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let user: AppUserWithTeamMember;
  try {
    ({ user } = await requireInternalUser());
  } catch {
    redirect("/");
  }

  const { id } = await params;

  // 1. Cargar la sesión + minuta + cuántas tareas dejó + asignaciones de proyecto (paralelo)
  const [session, minute, tareasDeLaReunion, agentRuns, projectAssignments] =
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
          resolvedClientId: true,
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
      tareasQueDejo(id, user),
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

  // 2. El dueño de la reunión: `resolvedClientId` (el manual solo si no hay). Con dueño, hace falta acceso a ese
  //    cliente; sin acceso, la reunión no existe para quien mira.
  const duenoId = duenoDeLaSesion(session);
  if (duenoId) {
    try {
      await requireAccessToClient(duenoId);
    } catch (e) {
      if (e instanceof ForbiddenError || e instanceof UnauthorizedError) notFound();
      throw e;
    }
  }
  const matchedClient = duenoId
    ? await prisma.client.findUnique({ where: { id: duenoId }, select: { id: true, name: true, company: true } })
    : null;

  // «Lo que dejó esta reunión». Si a la base le falta un SQL, la página se ve igual, sin la tarjeta.
  const tarjeta = await cargarTarjeta(id, user).catch((e) => {
    if (esquemaDesactualizado(e)) return null;
    throw e;
  });

  // 3. Cargar TeamMembers para selector de owner
  const teamMembers = await prisma.teamMember.findMany({
    where: { deactivatedAt: null }, // selector de owner: solo miembros activos
    select: { email: true, name: true, area: true },
    orderBy: [{ area: "asc" }, { name: "asc" }],
  });

  // 4. Proyectos del cliente matched (para el selector de override manual)
  const availableProjects = matchedClient
    ? await prisma.project.findMany({
        where: proyectoClasificableWhere({ clientId: matchedClient.id }),
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
    tareasDeLaReunion,
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

  // «Leer esta reunión»: una reunión con tarjeta (de un cliente o un prospecto, no de puertas adentro, y que quien mira
  // puede ver), con transcripción y sin minuta. Es el camino de una persona cuando la cola no la leyó (el remedio de INV44).
  const puedeLeer = !!tarjeta && !minute && (session.transcript?.trim().length ?? 0) >= MIN_TRANSCRIPT_CHARS;
  const arriba =
    tarjeta && tarjetaTieneAlgo(tarjeta) ? (
      <>
        <LoQueDejoLaReunion inicial={tarjeta} />
        {puedeLeer && <LeerEstaReunion sessionId={session.id} />}
      </>
    ) : puedeLeer ? (
      <LeerEstaReunion sessionId={session.id} />
    ) : undefined;

  return <SessionView data={data} tarjeta={arriba} />;
}
