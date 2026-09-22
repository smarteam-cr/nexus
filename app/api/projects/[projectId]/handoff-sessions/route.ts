import { NextRequest, NextResponse } from "next/server";
import { guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { vetoSiElHandoffEsDeOtro } from "@/lib/handoff/duenio";
import { prisma } from "@/lib/db/prisma";
import { adoptarSesionSinDuenio, belongsToClient } from "@/lib/sessions/project-sources";
import { decidirAlAgregar, motivoParaNoAdoptar } from "@/lib/sessions/candidatas-internas";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";

/**
 * POST /api/projects/[projectId]/handoff-sessions
 *
 * Override del humano sobre qué sesiones alimentan el handoff (A2 rediseñado):
 *   { sessionId, feeds: true }  → forzar INCLUIR (botón "Agregar" del pop-up). Linkea la
 *                                 sesión al proyecto si no lo estaba (source=manual).
 *   { sessionId, feeds: false } → forzar EXCLUIR (la "X" del panel). NO desvincula la
 *                                 sesión del proyecto (cronograma/minutas intactos): solo
 *                                 deja de alimentar el handoff.
 *
 * Gestionar el CONTEXTO del handoff (qué sesiones lo alimentan) = owner del cliente o
 * handoffAnywhere. El CSE cura el contexto de SUS proyectos (owner); editar el DOCUMENTO
 * del handoff sigue siendo handoffAnywhere. El scope de owner lo enfuerza requireHandoffAccess.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;
  // Qué sesiones alimentan el handoff se decide donde vive el handoff (lib/handoff/duenio.ts).
  const veto = await vetoSiElHandoffEsDeOtro(projectId);
  if (veto) return veto;

  let body: { sessionId?: unknown; feeds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId || typeof body.feeds !== "boolean") {
    return NextResponse.json({ error: "sessionId y feeds (boolean) requeridos" }, { status: 400 });
  }

  const [existing, session] = await Promise.all([
    prisma.sessionProject.findUnique({
      where: { sessionId_projectId: { sessionId, projectId } },
      select: { id: true },
    }),
    prisma.firefliesSession.findUnique({
      where: { id: sessionId },
      select: {
        resolvedClientId: true,
        manualClientId: true,
        participants: true,
        organizerEmail: true,
        projects: { select: { project: { select: { clientId: true } } } },
      },
    }),
  ]);
  if (!session) {
    return NextResponse.json({ error: "Sesión no existe" }, { status: 404 });
  }

  /* Sin dueño: vincular no alcanza. `getProjectMemberSessions` descarta al LEER lo que no
     pertenece al cliente, así que el link quedaría escrito, el botón parecería haber funcionado
     y el handoff seguiría vacío. Adoptarla la vuelve del cliente de verdad.

     En CUALQUIER proyecto desde el 2026-09-22 (decisión de Elías): el buscador del Contexto de
     cualquier proyecto las encuentra por texto (session-candidates/sin-duenio). Solo se adopta lo
     que no es de nadie por las dos vías —una sesión con dueño nunca se reasigna— y solo lo que
     `motivoParaNoAdoptar` deja: la regla vive en un módulo puro y la lee también el buscador. */
  const sinDuenio = session.resolvedClientId === null && session.manualClientId === null;
  let motivoNoAdoptable: string | null = null;
  if (body.feeds && sinDuenio) {
    const categorias = await prisma.sessionCategory.findMany({ select: { domains: true, kind: true } });
    motivoNoAdoptable = motivoParaNoAdoptar(
      {
        participants: session.participants,
        organizerEmail: session.organizerEmail,
        clientesDeSusProyectos: session.projects.map((p) => p.project.clientId),
      },
      guard.clientId,
      buildInternalDomainsSet(categorias),
    );
  }

  const decision = decidirAlAgregar({
    vinculoExiste: existing !== null,
    quiereIncluir: body.feeds,
    sinDuenio,
    perteneceAlCliente: belongsToClient(session, guard.clientId),
    motivoNoAdoptable,
  });
  if (decision.tipo === "rechazar") {
    return NextResponse.json({ error: decision.error }, { status: decision.status });
  }
  if (decision.tipo === "adoptar") {
    await adoptarSesionSinDuenio(sessionId, guard.clientId, guard.teamMember.email ?? null);
    /* Carrera: entre la lectura de arriba y la adopción, otra persona pudo asignarla a otro
       cliente (la adopción no pisa: solo escribe si sigue sin dueño). Se relee y, si no quedó de
       este cliente, no se vincula — el vínculo quedaría cruzado. */
    const ahora = await prisma.firefliesSession.findUnique({
      where: { id: sessionId },
      select: { resolvedClientId: true, manualClientId: true },
    });
    if (!ahora || !belongsToClient(ahora, guard.clientId)) {
      return NextResponse.json(
        { error: "Otra persona acaba de asignar esta reunión a otro cliente: revisala en Sesiones." },
        { status: 409 },
      );
    }
  }

  await prisma.sessionProject.upsert({
    where: { sessionId_projectId: { sessionId, projectId } },
    create: { sessionId, projectId, source: "manual", handoffOverride: body.feeds },
    // Forzar INCLUIR al handoff resucita un tombstone (included=false): sin esto el
    // override quedaría en true pero la sesión seguiría sin alimentar nada (excluida
    // de la membresía) y el botón "Agregar" no tendría efecto visible.
    update: { handoffOverride: body.feeds, ...(body.feeds ? { included: true } : {}) },
  });

  return NextResponse.json({ ok: true });
}
