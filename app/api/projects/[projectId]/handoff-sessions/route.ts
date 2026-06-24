import { NextRequest, NextResponse } from "next/server";
import { guardProjectEditHandoff } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

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

  await prisma.sessionProject.upsert({
    where: { sessionId_projectId: { sessionId, projectId } },
    create: { sessionId, projectId, source: "manual", handoffOverride: body.feeds },
    update: { handoffOverride: body.feeds },
  });

  return NextResponse.json({ ok: true });
}
