import { NextRequest, NextResponse } from "next/server";
import { guardProjectEditHandoff } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { belongsToClient } from "@/lib/sessions/project-sources";

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
 * Editar el handoff requiere la capacidad handoffAnywhere (el CSE no lo cura).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardProjectEditHandoff(projectId);
  if (guard instanceof NextResponse) return guard;

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

  // Hardening INV1 (escritura): si el link no existe todavía, el CREATE vincularía la
  // sesión al proyecto — validar que la sesión pertenezca al cliente del proyecto
  // (misma regla que el chokepoint de lectura). Un link ya existente solo cambia su
  // override de handoff, no crea vínculo nuevo.
  const existing = await prisma.sessionProject.findUnique({
    where: { sessionId_projectId: { sessionId, projectId } },
    select: { id: true },
  });
  if (!existing) {
    const session = await prisma.firefliesSession.findUnique({
      where: { id: sessionId },
      select: { resolvedClientId: true, manualClientId: true },
    });
    if (!session) {
      return NextResponse.json({ error: "Sesión no existe" }, { status: 404 });
    }
    if (session.resolvedClientId !== null && !belongsToClient(session, guard.clientId)) {
      return NextResponse.json(
        { error: "La sesión pertenece a otro cliente — no se puede vincular a este proyecto." },
        { status: 400 },
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
