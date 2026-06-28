/**
 * lib/business-cases/canvas-guard.ts
 *
 * Chequeo de pertenencia: una sección/canvas debe colgar de ESTE business case.
 * Evita que un sales user toque, vía un sectionId arbitrario, secciones de otro
 * caso (la autorización de rol la da guardSalesAccess; esto acota el recurso).
 */
import { prisma } from "@/lib/db/prisma";

/** true si la sección pertenece a un canvas del business case `businessCaseId`. */
export async function sectionInBusinessCase(
  businessCaseId: string,
  sectionId: string,
): Promise<boolean> {
  const s = await prisma.canvasSection.findUnique({
    where: { id: sectionId },
    select: { canvas: { select: { businessCaseId: true } } },
  });
  return !!s && s.canvas.businessCaseId === businessCaseId;
}
