/**
 * GET /api/projects/[projectId]/exploracion-de-venta
 *
 * La cuarta columna del contexto del handoff: la exploración de venta que le corresponde a este
 * proyecto (lib/exploraciones/handoff.ts decide cuál, o ninguna), resumida para que el CSE vea qué
 * le va a llegar al handoff y que es ESTIMADO. El CSE no tiene el permiso de Ventas: la ve por el
 * proyecto, con el mismo gate que el resto del contexto del handoff. El enlace al lienzo, solo
 * con `ventas.read`. Solo lee.
 *
 * Lo INTERNO (hipótesis, presupuesto, quién decide, lo no explorado…) llega SOLO por acá, a una
 * pantalla interna: al agente del handoff no se le manda (lib/exploraciones/para-el-handoff.ts).
 * El resumen es el MISMO que el de la columna de la propuesta (lib/exploraciones/en-las-propuestas.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { can } from "@/lib/auth/permissions/engine";
import { exploracionDelProyecto } from "@/lib/exploraciones/handoff";
import { resumenParaElContexto } from "@/lib/exploraciones/en-las-propuestas";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;

  const id = await exploracionDelProyecto(projectId);
  if (!id) return NextResponse.json({ exploracion: null });
  return NextResponse.json({ exploracion: await resumenParaElContexto(id, await can(guard.teamMember, "ventas", "read")) });
}
