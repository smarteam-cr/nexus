/**
 * /api/projects/[projectId]/publish-timeline
 *
 * Acción de "publicar" el CRONOGRAMA al cliente externo (D.1.5) — SEPARADA del
 * acceso (token+password) e INDEPENDIENTE del kickoff. Regla unificada: el
 * flag gobierna el cronograma donde sea que aparezca — la página propia
 * /external/cronograma Y la sección embebida en el kickoff publicado.
 *
 *   GET    → estado actual { published, publishedAt }
 *   POST   → publicar     (timelinePublishedAt = now)
 *   DELETE → despublicar  (timelinePublishedAt = null)
 *
 * Todos guarded con `guardAccessToProject`. Despublicar corta el acceso del
 * cliente en el siguiente render (los chokepoints re-chequean el flag en CADA
 * lectura). Espejo de publish-kickoff.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { freezeBaselineOnPublish } from "@/lib/timeline/baseline";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { timelinePublishedAt: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });
  }

  return NextResponse.json({
    published: !!project.timelinePublishedAt,
    publishedAt: project.timelinePublishedAt?.toISOString() ?? null,
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  // No publicar un cronograma fantasma: tiene que existir y tener al menos una fase,
  // sino el cliente vería una superficie vacía con badge "publicado".
  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { anchorStartDate: true, _count: { select: { phases: true } } },
  });
  if (!tl || tl._count.phases === 0) {
    return NextResponse.json(
      { error: "El cronograma no tiene fases todavía — no se puede publicar vacío." },
      { status: 400 },
    );
  }
  // D.3 fundación — publicar = prometer un calendario: exigir fecha de arranque para que
  // el baseline congele fechas planeadas absolutas (no solo semanas relativas).
  if (!tl.anchorStartDate) {
    return NextResponse.json(
      {
        error: "Definí la fecha de arranque del proyecto antes de publicar.",
      },
      { status: 400 },
    );
  }

  // D.3 fundación — congelar el baseline "vendido" al publicar (versionado; no crea versión
  // si la promesa no cambió). FAIL-OPEN: publicar es la acción crítica del CSE, así que un
  // fallo del freeze (bug, hiccup del pooler, etc.) NO debe bloquear la publicación — se
  // loguea y se publica igual; el baseline se vuelve a intentar en la próxima publicación.
  let baseline: { created: boolean; version: number | null } = { created: false, version: null };
  let baselineError = false;
  try {
    baseline = await freezeBaselineOnPublish(projectId, guard.user.email ?? null);
  } catch (e) {
    baselineError = true;
    console.error(
      "[publish-timeline] freezeBaselineOnPublish falló (se publica igual):",
      e instanceof Error ? e.message : e,
    );
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { timelinePublishedAt: new Date() },
    select: { timelinePublishedAt: true },
  });

  return NextResponse.json({
    published: true,
    publishedAt: updated.timelinePublishedAt?.toISOString() ?? null,
    baselineVersion: baseline.version,
    baselineCreated: baseline.created,
    baselineError,
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
    data: { timelinePublishedAt: null },
    select: { id: true },
  });

  return NextResponse.json({ published: false, publishedAt: null });
}
