/**
 * /api/projects/[projectId]/publish-kickoff
 *
 * Acción de "publicar" el Kickoff al cliente externo — SEPARADA del acceso
 * (token+password). El acceso puede existir sin que el Kickoff sea visible; el
 * cliente solo ve el landing cuando `Project.kickoffPublishedAt != null`.
 *
 *   GET    → estado actual { published, publishedAt }
 *   POST   → publicar     (kickoffPublishedAt = now)
 *   DELETE → despublicar  (kickoffPublishedAt = null)
 *
 * Todos guarded con `guardAccessToProject` — solo el CSE con acceso al cliente
 * puede publicar/despublicar. Despublicar corta el acceso del cliente en el
 * siguiente render (el chokepoint externo re-chequea este flag en cada lectura).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { freezeKickoffSnapshot } from "@/lib/canvas/kickoff-snapshot";
import { maybeReanchorToKickoff } from "@/lib/timeline/reanchor";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { kickoffPublishedAt: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
  }

  return NextResponse.json({
    published: !!project.kickoffPublishedAt,
    publishedAt: project.kickoffPublishedAt?.toISOString() ?? null,
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  // Congelar el snapshot client-safe ANTES de marcar publicado: publicar el kickoff
  // (también desde este pop-up de acceso) debe dejar al cliente viendo una foto
  // DELIBERADA, no lo que haya en vivo. Espejo de publish-timeline. Best-effort: si
  // falla, el backfill perezoso de kickoff-view lo cubre.
  try {
    await freezeKickoffSnapshot(projectId);
  } catch (e) {
    console.error(
      "[publish-kickoff] no se pudo congelar el snapshot (se publica igual):",
      e instanceof Error ? e.message : e,
    );
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { kickoffPublishedAt: new Date() },
    select: { kickoffPublishedAt: true },
  });

  // Ciclo de vida: publicar suele preceder al Kick Off real por poco — chequeo
  // barato e idempotente del ancla (best-effort; guardas en el helper).
  try {
    await maybeReanchorToKickoff(projectId);
  } catch (e) {
    console.error("[publish-kickoff] re-anclaje best-effort falló:", e);
  }

  return NextResponse.json({
    published: true,
    publishedAt: updated.kickoffPublishedAt?.toISOString() ?? null,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  await prisma.project.update({
    where: { id: projectId },
    data: { kickoffPublishedAt: null },
    select: { id: true },
  });

  return NextResponse.json({ published: false, publishedAt: null });
}
