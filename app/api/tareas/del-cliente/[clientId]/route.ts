/**
 * GET /api/tareas/del-cliente/[clientId] — la ficha del cliente › La cuenta › Tareas (ficha A del roadmap, 2026-10-17):
 * todo lo que Smarteam tiene que hacer con esa empresa, de cualquier equipo, con de dónde viene cada tarea.
 *
 * Lo arma `cargarTareasDeLaCuenta` con la regla de visibilidad de todas las listas de Tareas: nunca lo «Solo para mí» de
 * otros, y la cita y el contexto de cada reunión con su regla. 404 si el cliente no existe o no lo ves. Marcar y decidir
 * van por las rutas de siempre (`/api/tareas/[id]`), por el único escritor.
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarTareasDeLaCuenta } from "@/lib/tareas/consultas";

type Params = { params: Promise<{ clientId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const { clientId } = await params;
  try {
    const p = await prepararTareas(guard);
    if (p instanceof NextResponse) return p;
    return NextResponse.json(await cargarTareasDeLaCuenta(p.ctx, p.clientes, clientId));
  } catch (e) {
    return respuestaDeError(e);
  }
}
