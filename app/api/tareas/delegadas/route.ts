/**
 * GET /api/tareas/delegadas — «Lo que delegaste»: lo que le pediste o asignaste a otras personas y a otros equipos, y
 * cómo va. Lo arma `cargarLoQueDelegaste` con la regla de visibilidad de siempre.
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarLoQueDelegaste } from "@/lib/tareas/consultas";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  try {
    const p = await prepararTareas(guard);
    if (p instanceof NextResponse) return p;
    return NextResponse.json(await cargarLoQueDelegaste(p.ctx, p.clientes));
  } catch (e) {
    return respuestaDeError(e);
  }
}
