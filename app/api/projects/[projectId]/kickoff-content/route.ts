/**
 * /api/projects/[projectId]/kickoff-content
 *
 * STAGING (D.3) del CONTENIDO del kickoff (los bloques de las secciones). Los
 * bloques se auto-guardan en vivo (borrador), pero el cliente ve el SNAPSHOT
 * congelado en el último "Subir" — no las ediciones en curso.
 *
 *   GET  → estado para la barra "cambios sin subir"
 *          { publishedSnapshotAt, contentUpdatedAt, dirty }
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

type Params = Promise<{ projectId: string }>;

// dirty = el contenido se editó después de la última subida (o nunca se subió y hay ediciones).
const isDirty = (publishedSnapshotAt: Date | null, contentUpdatedAt: Date | null) =>
  !!contentUpdatedAt && (!publishedSnapshotAt || contentUpdatedAt > publishedSnapshotAt);

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId, name: "Kickoff" },
    select: { publishedSnapshotAt: true, contentUpdatedAt: true },
  });

  return NextResponse.json({
    publishedSnapshotAt: canvas?.publishedSnapshotAt?.toISOString() ?? null,
    contentUpdatedAt: canvas?.contentUpdatedAt?.toISOString() ?? null,
    dirty: canvas ? isDirty(canvas.publishedSnapshotAt, canvas.contentUpdatedAt) : false,
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
