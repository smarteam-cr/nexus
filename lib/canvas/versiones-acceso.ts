/**
 * lib/canvas/versiones-acceso.ts — quién puede usar las versiones de un documento.
 *
 * Las rutas ya llaman `guardAccessToProject` (acceso al proyecto). Esto suma lo propio:
 *   · TRAER UNA SECCIÓN: la misma regla que editar ese documento a mano (el handoff tiene su veto
 *     para el CSE). Traer una sección es editar una sección.
 *   · RESTAURAR ENTERO: además, la celda de REGENERAR ese documento — restaurar reescribe el
 *     documento completo, igual que regenerarlo.
 * Y siempre: la versión tiene que ser de un documento de ESTE proyecto (un id ajeno es un 404).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { denyHandoffCanvasEditForCse, guardPermission } from "@/lib/auth/api-guards";
import { pieceForCanvas } from "@/lib/pieces/registry";

export async function documentoDelProyecto(projectId: string, canvasId: string) {
  const canvas = await prisma.projectCanvas.findUnique({
    where: { id: canvasId },
    select: { id: true, projectId: true, slug: true, name: true, businessCaseId: true },
  });
  return canvas && canvas.projectId === projectId ? canvas : null;
}

/** null = puede; si no, la respuesta de rechazo. */
export async function permisoParaUsarVersion(
  canvas: { slug: string | null; name: string; businessCaseId: string | null },
  accion: "traer" | "restaurar",
): Promise<NextResponse | null> {
  const veto = await denyHandoffCanvasEditForCse(canvas.slug ?? canvas.name);
  if (veto) return veto;
  if (accion === "restaurar") {
    const pieza = pieceForCanvas(canvas);
    if (pieza) {
      const perm = await guardPermission(pieza.permissionSection as Parameters<typeof guardPermission>[0], "regenerate" as never);
      if (perm instanceof NextResponse) return perm;
    }
  }
  return null;
}
