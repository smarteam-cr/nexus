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
 *
 * `portada` (2026-10-20): los números de la fila de datos de la portada (semanas, fases, fecha de
 * arranque) tal como los ve el CSE en ese momento, desde el cronograma VIVO. La vista del cliente los
 * usa SOLO cuando el cronograma que puede ver no aporta nada (nunca se publicó, u oculto del kickoff):
 * sin esto, Cayalá subió su kickoff con «26 oct 2026» en la portada y el cliente no vio fecha.
 * Server-side only.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { readClientProcesos } from "@/lib/canvas/read-procesos";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { readClientTimeline } from "@/lib/external/timeline-view";
import { cronogramaParaLaFila } from "@/lib/kickoff/datos-de-la-portada";

/** Devuelve la fecha del snapshot, o null si el proyecto no tiene canvas de Kickoff. */
export async function freezeKickoffSnapshot(projectId: string): Promise<Date | null> {
  const [project, canvas] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true } }),
    prisma.projectCanvas.findFirst({ where: { projectId, ...canvasOf("kickoff") }, select: { id: true } }),
  ]);
  if (!project || !canvas) return null;

  const [sections, procesos, cronograma] = await Promise.all([
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
    readClientTimeline(projectId),
  ]);
  const portada = cronogramaParaLaFila(cronograma);

  const snapshotAt = new Date();
  await prisma.projectCanvas.update({
    where: { id: canvas.id },
    data: {
      publishedSnapshot: { sections, procesos, portada } as unknown as Prisma.InputJsonValue,
      publishedSnapshotAt: snapshotAt,
    },
  });
  return snapshotAt;
}
