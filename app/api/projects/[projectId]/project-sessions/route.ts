import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { belongsToClient } from "@/lib/sessions/project-sources";

/**
 * GET/POST /api/projects/[projectId]/project-sessions
 *
 * Curación de la MEMBRESÍA de contexto del proyecto (plan "contexto por proyecto"):
 * qué sesiones alimentan handoff/kickoff/cronograma/análisis de ESTE proyecto.
 * Distinto de /handoff-sessions (override handoff-only) y de /session-candidates
 * (lectura para el panel del handoff).
 *
 * GET → {
 *   multiProject,        // cliente con ≥2 proyectos activos (gate del chip de aviso)
 *   unreviewedCount,     // links included+agent sin reviewedAt (estado "revisado" derivado)
 *   members,             // links del proyecto (incluye tombstones included=false, con badge)
 *   candidates,          // demás sesiones del cliente (para "Agregar")
 * }
 *
 * POST { sessionId, included } → upsert de la decisión humana: included + reviewedAt/
 *   reviewedBy. En links nuevos source="manual"; en existentes se PRESERVA source (la
 *   procedencia IA sigue visible) — reviewedAt≠null ya lo lockea contra el clasificador.
 * POST { confirmAll: true } → estampa reviewedAt en todos los links de IA vigentes del
 *   proyecto (botón "Confirmar contexto").
 *
 * RBAC: guardAccessToProject — el CSE cura la membresía de SUS proyectos.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const { clientId } = guard;

  const [activeProjects, links] = await Promise.all([
    prisma.project.count({
      where: { clientId, status: "active", serviceType: { not: "__strategy__" } },
    }),
    prisma.sessionProject.findMany({
      where: { projectId },
      select: {
        isPrimary: true,
        source: true,
        confidence: true,
        rationale: true,
        included: true,
        reviewedAt: true,
        session: {
          select: {
            id: true, title: true, date: true, participants: true,
            resolvedClientId: true, manualClientId: true,
            projects: { select: { projectId: true } },
          },
        },
      },
    }),
  ]);

  // Defensa de runtime (misma que el chokepoint): links cross-client stale no se muestran.
  const safeLinks = links.filter((l) => belongsToClient(l.session, clientId));

  const members = safeLinks
    .sort((a, b) => b.session.date.getTime() - a.session.date.getTime())
    .map((l) => ({
      sessionId: l.session.id,
      title: l.session.title,
      date: l.session.date,
      participants: l.session.participants,
      isPrimary: l.isPrimary,
      source: l.source,
      confidence: l.confidence,
      rationale: l.rationale,
      included: l.included,
      reviewedAt: l.reviewedAt,
      linkedElsewhere: l.session.projects.some((p) => p.projectId !== projectId),
    }));
  const memberIds = new Set(members.map((m) => m.sessionId));

  const unreviewedCount = safeLinks.filter(
    (l) => l.included && l.source === "agent" && l.reviewedAt === null,
  ).length;

  const clientSessions = await prisma.firefliesSession.findMany({
    where: {
      OR: [{ resolvedClientId: clientId }, { manualClientId: clientId }],
      date: { lte: new Date() },
    },
    orderBy: { date: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      date: true,
      participants: true,
      projects: { select: { projectId: true } },
    },
  });

  const candidates = clientSessions
    .filter((s) => !memberIds.has(s.id))
    .map((s) => ({
      sessionId: s.id,
      title: s.title,
      date: s.date,
      participants: s.participants,
      linkedElsewhere: s.projects.some((p) => p.projectId !== projectId),
    }));

  return NextResponse.json({
    multiProject: activeProjects >= 2,
    unreviewedCount,
    members,
    candidates,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const { clientId, user } = guard;

  let body: { sessionId?: unknown; included?: unknown; confirmAll?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const now = new Date();

  // ── Confirmar contexto: estampa reviewedAt en los links de IA vigentes ──
  if (body.confirmAll === true) {
    const { count } = await prisma.sessionProject.updateMany({
      where: { projectId, source: "agent", reviewedAt: null, included: true },
      data: { reviewedAt: now, reviewedBy: user.email },
    });
    return NextResponse.json({ ok: true, confirmed: count });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId || typeof body.included !== "boolean") {
    return NextResponse.json(
      { error: "sessionId e included (boolean) requeridos — o confirmAll: true" },
      { status: 400 },
    );
  }

  const session = await prisma.firefliesSession.findUnique({
    where: { id: sessionId },
    select: { resolvedClientId: true, manualClientId: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Sesión no existe" }, { status: 404 });
  }
  // Hardening INV1: INCLUIR exige que la sesión pertenezca al cliente del proyecto
  // (misma regla que el chokepoint de lectura). EXCLUIR siempre se permite: es la
  // dirección segura (también sirve para apagar un link stale).
  if (
    body.included &&
    session.resolvedClientId !== null &&
    !belongsToClient(session, clientId)
  ) {
    return NextResponse.json(
      { error: "La sesión pertenece a otro cliente — no se puede vincular a este proyecto." },
      { status: 400 },
    );
  }

  const link = await prisma.sessionProject.upsert({
    where: { sessionId_projectId: { sessionId, projectId } },
    create: {
      sessionId,
      projectId,
      isPrimary: false,
      source: "manual",
      included: body.included,
      reviewedAt: now,
      reviewedBy: user.email,
    },
    // En links existentes NO se pisa source: la procedencia (IA vs manual) sigue
    // visible en la UI; reviewedAt ≠ null ya lockea el link contra el clasificador.
    update: {
      included: body.included,
      reviewedAt: now,
      reviewedBy: user.email,
    },
  });

  return NextResponse.json({ ok: true, linkId: link.id, included: link.included });
}
