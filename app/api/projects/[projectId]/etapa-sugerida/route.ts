import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardPermission } from "@/lib/auth/api-guards";
import { cerrarSugerenciaDeEtapa } from "@/lib/projects/etapa-desde-reunion-server";

/**
 * DELETE /api/projects/[projectId]/etapa-sugerida — «Sigue en <etapa de hoy>»: el CSE respondió la
 * encuesta de la etapa diciendo que la reunión no lo movió. Borra la sugerencia; HubSpot no se toca.
 *
 * Pide la misma celda que mover la etapa (`proyectos.cambiarEstadoHubspot`): descartar es responder la
 * misma pregunta, y quien no puede moverla tampoco decide que no se mueva. Mover a OTRA etapa no pasa
 * por acá: va por `estado-hubspot`, que borra la sugerencia al escribir.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const permiso = await guardPermission("proyectos", "cambiarEstadoHubspot");
  if (permiso instanceof NextResponse) return permiso;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  await cerrarSugerenciaDeEtapa(projectId);
  return NextResponse.json({ ok: true });
}
