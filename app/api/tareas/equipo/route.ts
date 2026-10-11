/**
 * GET /api/tareas/equipo?equipo=&semana= — la semana del equipo: una columna por persona, «Por asignar», lo pedido a
 * otros equipos y sus proyectos. Ves la de tu equipo (o las que lideras; el Super Admin, todas).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarSemanaDelEquipo } from "@/lib/tareas/consultas";

export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const sp = req.nextUrl.searchParams;
  try {
    return NextResponse.json(await cargarSemanaDelEquipo(p.ctx, p.clientes, sp.get("equipo"), sp.get("semana")));
  } catch (e) {
    return respuestaDeError(e);
  }
}
