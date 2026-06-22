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
import { Prisma } from "@prisma/client";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { freezeBaselineOnPublish } from "@/lib/timeline/baseline";
import { readClientTimeline } from "@/lib/external/timeline-view";

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
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  // Razón del cambio (opcional): el canvas del cronograma la pide en un modal al "Subir";
  // el pop-up de acceso publica sin razón → default. Queda en un TimelineChange (audit D.3).
  const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  // No publicar un cronograma fantasma: tiene que existir y tener al menos una fase,
  // sino el cliente vería una superficie vacía con badge "publicado".
  const tl = await prisma.projectTimeline.findUnique({
    where: { projectId },
    select: { id: true, anchorStartDate: true, _count: { select: { phases: true } } },
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

  // D.3 staging — preparar el SNAPSHOT client-safe ANTES de publicar: es lo ÚNICO que
  // verá el cliente (la lectura externa ya no cae a vivo). Si falla, NO publicamos
  // (fail-closed): mejor un error claro que publicar sin congelar y reabrir el leak.
  let snapshot: Awaited<ReturnType<typeof readClientTimeline>>;
  try {
    snapshot = await readClientTimeline(projectId);
  } catch (e) {
    console.error(
      "[publish-timeline] no se pudo preparar el snapshot (no se publica):",
      e instanceof Error ? e.message : e,
    );
    return NextResponse.json(
      { error: "No se pudo preparar la versión para el cliente. Reintentá en un momento." },
      { status: 500 },
    );
  }

  // D.3 fundación — congelar el baseline "vendido" al publicar (versionado; no crea versión
  // si la promesa no cambió). FAIL-OPEN: el baseline es AUDITORÍA (no lo ve el cliente), así
  // que un fallo del freeze NO bloquea la publicación; se reintenta en la próxima.
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

  // Congelar el snapshot (ProjectTimeline) y recién entonces marcar publicado (Project).
  // Orden: snapshot primero → publicado ⟹ snapshot existe siempre.
  await prisma.projectTimeline.update({
    where: { projectId },
    data: { publishedSnapshot: snapshot as unknown as Prisma.InputJsonValue },
  });
  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { timelinePublishedAt: new Date() },
    select: { timelinePublishedAt: true },
  });

  // Registrar el "Subir" en el audit (D.3): el "por qué" de esta versión + el snapshot
  // publicado, con quién y cuándo. Best-effort: no bloquea la publicación si falla.
  try {
    await prisma.timelineChange.create({
      data: {
        timelineId: tl.id,
        reason: reason ?? "Publicación al cliente",
        kind: "MANUAL",
        changedByEmail: guard.user.email ?? null,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    console.error(
      "[publish-timeline] no se pudo registrar el TimelineChange del publish:",
      e instanceof Error ? e.message : e,
    );
  }

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
