/**
 * /api/projects/[projectId]/kickoff-content
 *
 * STAGING (D.3) del CONTENIDO del kickoff (los bloques de las secciones). Los
 * bloques se auto-guardan en vivo (borrador), pero el cliente ve el SNAPSHOT
 * congelado en el último "Subir" — no las ediciones en curso.
 *
 *   GET  → estado para la barra "cambios sin subir"
 *          { publishedSnapshotAt, contentUpdatedAt, dirty }
 *   POST → "Subir": congela el snapshot client-safe (secciones + bloques
 *          CONFIRMED, sin campos internos) que verá el cliente hasta el próximo Subir.
 *
 * El filtro de visibilidad (hiddenKickoffKeys) NO se aplica acá: queda dinámico,
 * se persiste por separado (kickoff-visibility) y lo aplica la LECTURA externa
 * (kickoff-view). Guarded con guardAccessToProject. Espejo conceptual de
 * publish-timeline para el cronograma.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";

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

  const canvas = await prisma.projectCanvas.findFirst({
    where: { projectId, name: "Kickoff" },
    select: { id: true },
  });
  if (!canvas) {
    return NextResponse.json({ error: "El proyecto no tiene canvas de Kickoff." }, { status: 404 });
  }

  // Mismo shape/orden que la lectura externa (kickoff-view): SOLO bloques CONFIRMED,
  // en shape limpio (sin source/status/agentRunId).
  const sections = await prisma.canvasSection.findMany({
    where: { canvasId: canvas.id },
    orderBy: { order: "asc" },
    select: {
      id: true,
      key: true,
      label: true,
      titleOverride: true,
      eyebrowOverride: true,
      order: true,
      blocks: {
        where: { status: "CONFIRMED" },
        orderBy: { order: "asc" },
        select: { id: true, blockType: true, content: true, data: true },
      },
    },
  });

  const now = new Date();
  await prisma.projectCanvas.update({
    where: { id: canvas.id },
    data: {
      publishedSnapshot: { sections } as unknown as Prisma.InputJsonValue,
      publishedSnapshotAt: now,
    },
  });

  return NextResponse.json({ publishedSnapshotAt: now.toISOString(), dirty: false });
}
