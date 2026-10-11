/**
 * GET /api/tareas/del-proyecto/[projectId] — los «Pendientes recientes» del Resumen de un proyecto y su diálogo «Ver
 * los N» (memoria de la cuenta, etapa 2: reemplazan a `ActionItem`, que se retiró).
 *
 * Lo arma `cargarTareasDelProyecto` con la regla de visibilidad de todas las listas de Tareas: nunca las privadas de
 * otros, y la cita y el contexto con su regla. 404 si el proyecto no existe o es de un cliente que no ves. Marcar,
 * agregar y sacar van por las rutas de siempre (`/api/tareas`, `/api/tareas/[id]`), por el único escritor.
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarTareasDelProyecto } from "@/lib/tareas/consultas";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const { projectId } = await params;
  try {
    const p = await prepararTareas(guard);
    if (p instanceof NextResponse) return p;
    return NextResponse.json(await cargarTareasDelProyecto(p.ctx, p.clientes, projectId));
  } catch (e) {
    return respuestaDeError(e);
  }
}
