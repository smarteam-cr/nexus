/**
 * /api/tareas/fuentes — el sprint de cada equipo: la serie de su reunión y quiénes están (ficha A, 2026-10-17).
 *
 * GET  ?equipo= → el sprint (las series que lee, quiénes están, lo último que leyó) y, a quien lo lidera, las series de
 *                 su calendario para elegir.
 * POST          → sumar una serie: una reunión recurrente de tu calendario, del equipo. Solo quien lidera el sprint.
 * Las reglas viven en lib/tareas/fuentes.ts; las filas las escribe lib/tareas/mutaciones.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarSprint, crearFuente } from "@/lib/tareas/fuentes-server";
import { CrearFuente } from "@/lib/tareas/schema";

export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  try {
    return NextResponse.json(await cargarSprint(p.ctx, p.clientes, req.nextUrl.searchParams.get("equipo")));
  } catch (e) {
    return respuestaDeError(e);
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = CrearFuente.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  try {
    const f = await crearFuente(p.ctx, p.clientes, parsed.data);
    return NextResponse.json({ ...f, sprint: await cargarSprint(p.ctx, p.clientes, parsed.data.equipo) });
  } catch (e) {
    return respuestaDeError(e);
  }
}
