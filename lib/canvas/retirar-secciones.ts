/**
 * lib/canvas/retirar-secciones.ts — OCULTAR, sin borrar, las secciones que un documento dejó de
 * tener (2026-10-02).
 *
 * Cuando una sección se muda de documento —la política rectora de Planificación al Diagnóstico, las
 * acciones de Ejecución al Diagnóstico— el documento viejo la sigue teniendo con su contenido. Al
 * regenerarlo, mostrarla sería contradecir al documento que ahora manda; borrarla perdería lo que
 * alguien escribió. Se OCULTA: no sale al cliente ni al PDF, y sus datos siguen ahí (se pueden
 * volver a mostrar con el ojo, o traer desde «Versiones anteriores»).
 *
 * El estado oculto vive en el Json `ProjectCanvas.sections` (`patchSectionEntry`), no en una columna.
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { patchSectionEntry } from "@/lib/business-cases/section-briefs";

/**
 * Oculta las `retiradas` que estén entre las `presentes`. Devuelve las que ocultó. Idempotente:
 * ocultar una ya oculta no cambia nada.
 */
export async function ocultarSeccionesRetiradas(
  canvasId: string,
  presentes: readonly string[],
  retiradas: readonly string[],
): Promise<string[]> {
  const aOcultar = presentes.filter((k) => retiradas.includes(k));
  if (!aOcultar.length) return [];
  const c = await prisma.projectCanvas.findUnique({ where: { id: canvasId }, select: { sections: true } });
  let entradas: unknown = c?.sections;
  for (const key of aOcultar) entradas = patchSectionEntry(entradas, key, { hidden: true });
  await prisma.projectCanvas.update({
    where: { id: canvasId },
    data: { sections: entradas as Prisma.InputJsonValue, contentUpdatedAt: new Date() },
  });
  return aOcultar;
}
