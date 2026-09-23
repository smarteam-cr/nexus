import { NextRequest, NextResponse } from "next/server";
import { guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { vetoSiElHandoffEsDeOtro } from "@/lib/handoff/duenio";
import { prisma } from "@/lib/db/prisma";
import { prepararVinculoManual } from "@/lib/sessions/agregar-sesion";

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

  /* La decisión —rechazo cross-cliente, adopción de huérfanas, relectura por carrera— vive en UN
     lugar desde el 2026-09-23 (lib/sessions/agregar-sesion.ts): la usan esta puerta y la del
     Contexto del cronograma, y cada una escribe SOLO su afinado. */
  const prep = await prepararVinculoManual({
    sessionId,
    projectId,
    clientId: guard.clientId,
    quiereIncluir: body.feeds,
    actorEmail: guard.teamMember.email ?? null,
  });
  if (!prep.ok) return NextResponse.json({ error: prep.error }, { status: prep.status });

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
