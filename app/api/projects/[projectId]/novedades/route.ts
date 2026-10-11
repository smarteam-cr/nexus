/**
 * GET /api/projects/[projectId]/novedades — las novedades de los documentos del proyecto (memoria de la cuenta,
 * etapa 6): lo que un hecho pendiente de una reunión le propone a un documento que ya tiene contenido. Se calculan, no
 * se guardan (lib/seguimiento/novedades.ts). Las pinta la franja de arriba del documento y el riel.
 *
 * Responde `{ activas: false, porPieza: {} }` con `SEGUIMIENTO_HECHOS` apagada o sin el SQL de los hechos: la pantalla
 * no muestra nada y nada se rompe.
 *
 * Guard: acceso al proyecto. Decidir una novedad es otra ruta, con la celda del documento.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { novedadesDelProyecto } from "@/lib/seguimiento/novedades-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await novedadesDelProyecto(projectId));
}
