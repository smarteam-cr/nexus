/**
 * lib/canvas/kickoff-snapshot.ts
 *
 * Congela el SNAPSHOT client-safe del kickoff — lo ÚNICO que ve el cliente hasta el
 * próximo "Subir": secciones + bloques CONFIRMED + procesos confirmados (RAW; el
 * filtro hidden se aplica en la lectura). Lo usan los DOS caminos que publican el
 * kickoff, para que publicado SIEMPRE implique snapshot:
 *   - "Subir cambios" del canvas        → kickoff-content (POST)
 *   - "Publicar kickoff" del pop-up acceso → publish-kickoff (POST)
 * Sin esto, publicar desde el pop-up dejaba el snapshot en null y la lectura externa
 * caía al backfill perezoso (congelaba lo que hubiera en vivo al primer render).
 * Server-side only.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { readClientProcesos } from "@/lib/canvas/read-procesos";

/** Devuelve la fecha del snapshot, o null si el proyecto no tiene canvas de Kickoff. */
export async function freezeKickoffSnapshot(projectId: string): Promise<Date | null> {
  const [project, canvas] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true } }),
    prisma.projectCanvas.findFirst({ where: { projectId, name: "Kickoff" }, select: { id: true } }),
  ]);
  if (!project || !canvas) return null;

  const [sections, procesos] = await Promise.all([
    prisma.canvasSection.findMany({
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
    }),
    readClientProcesos(project.clientId, { onlyConfirmed: true }),
  ]);

  const snapshotAt = new Date();
  await prisma.projectCanvas.update({
    where: { id: canvas.id },
    data: {
      publishedSnapshot: { sections, procesos } as unknown as Prisma.InputJsonValue,
      publishedSnapshotAt: snapshotAt,
    },
  });
  return snapshotAt;
}
