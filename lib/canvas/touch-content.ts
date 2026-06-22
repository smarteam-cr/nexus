/**
 * lib/canvas/touch-content.ts
 *
 * D.3 staging — marca el canvas dueño de una sección como "editado después de la
 * última subida": setea ProjectCanvas.contentUpdatedAt = now. Dispara la barra de
 * "cambios sin subir" del kickoff (contentUpdatedAt > publishedSnapshotAt).
 *
 * Lo llaman las rutas que mutan contenido client-facing: los bloques
 * (canvas-sections/[sectionId]/blocks) y la metadata de sección
 * (canvas-sections/[sectionId]: title/eyebrow override). Best-effort: nunca
 * bloquea la mutación principal — el contador de "cambios sin subir" es secundario.
 */
import { prisma } from "@/lib/db/prisma";

export async function touchCanvasContent(sectionId: string): Promise<void> {
  try {
    const section = await prisma.canvasSection.findUnique({
      where: { id: sectionId },
      select: { canvasId: true },
    });
    if (section?.canvasId) {
      await prisma.projectCanvas.update({
        where: { id: section.canvasId },
        data: { contentUpdatedAt: new Date() },
      });
    }
  } catch {
    /* el flag de "cambios sin subir" es secundario al guardado del contenido */
  }
}
