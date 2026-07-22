/**
 * /api/projects/[projectId]/handoff-sources
 *
 * Fuentes MANUALES del handoff de un proyecto: transcripts/resúmenes pegados a mano
 * (reuniones que NO entraron por el sync de Google Workspace). Se guardan en
 * HandoffSource (1:N bajo Project) para que el agente de handoff las use como una
 * fuente más y para que el handoff sea reproducible/auditable.
 *
 *   GET  → { sources } (no borradas, orden cronológico)
 *   POST { title?, content } → crea una fuente (createdByEmail del guard)
 *
 * Guarded con guardProjectHandoffAccess (mismo gate que el resto del handoff).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;

  const sources = await prisma.handoffSource.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, content: true, createdByEmail: true, createdAt: true },
  });
  return NextResponse.json({ sources });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  // Gestionar fuentes del contexto = owner del cliente o handoffAnywhere (el CSE pega
  // fuentes en SUS proyectos). Scope de owner enforced por requireHandoffAccess.
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: { title?: unknown; content?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
  if (!content) {
    return NextResponse.json({ error: "El contenido no puede estar vacío." }, { status: 400 });
  }

  const created = await prisma.handoffSource.create({
    data: { projectId, title, content, createdByEmail: guard.user.email ?? null },
    select: { id: true, title: true, content: true, createdByEmail: true, createdAt: true },
  });
  return NextResponse.json({ source: created }, { status: 201 });
}
