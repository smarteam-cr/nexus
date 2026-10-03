/**
 * /api/projects/[projectId]/kickoff-content
 *
 * STAGING (D.3) del CONTENIDO del kickoff (los bloques de las secciones). Los
 * bloques se auto-guardan en vivo (borrador), pero el cliente ve el SNAPSHOT
 * congelado en el último "Subir" — no las ediciones en curso.
 *
 *   GET  → estado para la barra "cambios sin subir"
 *          { publishedSnapshotAt, contentUpdatedAt, dirty, cronogramaSinSubir, cronogramaSinPublicar }
 *   POST → "Subir": congela el snapshot client-safe (secciones + bloques CONFIRMED
 *          + procesos confirmados) — TODO lo que ve el cliente — hasta el próximo Subir.
 *
 * El filtro de visibilidad (hiddenKickoffKeys) NO se aplica acá: queda dinámico,
 * se persiste por separado (kickoff-visibility) y lo aplica la LECTURA externa
 * (kickoff-view) sobre el snapshot. Guarded con guardAccessToProject. Espejo
 * conceptual de publish-timeline para el cronograma.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { freezeKickoffSnapshot } from "@/lib/canvas/kickoff-snapshot";
import { canvasOf } from "@/lib/pieces/canvas-query";

type Params = Promise<{ projectId: string }>;

// dirty = el contenido se editó después de la última subida (o nunca se subió y hay ediciones).
const isDirty = (publishedSnapshotAt: Date | null, contentUpdatedAt: Date | null) =>
  !!contentUpdatedAt && (!publishedSnapshotAt || contentUpdatedAt > publishedSnapshotAt);

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const [canvas, proyecto, tl] = await Promise.all([
    prisma.projectCanvas.findFirst({
      where: { projectId, ...canvasOf("kickoff") },
      select: { publishedSnapshotAt: true, contentUpdatedAt: true },
    }),
    prisma.project.findUnique({ where: { id: projectId }, select: { timelinePublishedAt: true } }),
    prisma.projectTimeline.findUnique({
      where: { projectId },
      select: { anchorStartDate: true, lastEditedByHuman: true, publishedSnapshot: true, _count: { select: { phases: true } } },
    }),
  ]);

  /* ── EL CRONOGRAMA QUE VE EL CLIENTE DENTRO DEL KICKOFF (2026-10-02) ────────────────────────
     La fecha de arranque y el cronograma del enlace del kickoff salen de la FOTO PUBLICADA DEL
     CRONOGRAMA, no del kickoff. «Subir» el kickoff no la renovaba, así que en «CAV - SHP» Nexus
     decía 21-sep y el cliente leía 1-sep, y corregirla no cambiaba el enlace. Acá se avisa:
     `cronogramaSinSubir` = publicado y editado después (o con otra fecha de arranque);
     `cronogramaSinPublicar` = existe y nunca se subió (el cliente lee «Por definir»). */
  const anclaPublicada = (tl?.publishedSnapshot as { anchorStartDate?: string | null } | null)?.anchorStartDate ?? null;
  const anclaViva = tl?.anchorStartDate?.toISOString() ?? null;
  const conFases = (tl?._count.phases ?? 0) > 0;
  const publicadoAt = proyecto?.timelinePublishedAt ?? null;
  const cronogramaSinSubir =
    conFases &&
    !!publicadoAt &&
    ((!!tl?.lastEditedByHuman && tl.lastEditedByHuman > publicadoAt) ||
      (anclaPublicada?.slice(0, 10) ?? null) !== (anclaViva?.slice(0, 10) ?? null));
  const cronogramaSinPublicar = conFases && !publicadoAt;

  return NextResponse.json({
    publishedSnapshotAt: canvas?.publishedSnapshotAt?.toISOString() ?? null,
    contentUpdatedAt: canvas?.contentUpdatedAt?.toISOString() ?? null,
    dirty: canvas ? isDirty(canvas.publishedSnapshotAt, canvas.contentUpdatedAt) : false,
    cronogramaSinSubir,
    cronogramaSinPublicar,
  });
}

export async function POST(_req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const snapshotAt = await freezeKickoffSnapshot(projectId);
  if (!snapshotAt) {
    return NextResponse.json({ error: "El proyecto no tiene canvas de Kickoff." }, { status: 404 });
  }
  return NextResponse.json({ publishedSnapshotAt: snapshotAt.toISOString(), dirty: false });
}
