/**
 * /api/tareas — Mis tareas.
 *
 * GET  → lo de quien está logueado: por decidir, esta semana, más adelante, lo que pidió, hechas, semanas sin revisar.
 * POST → anota una tarea (para sí, para otra persona o para un equipo). Lo que es para otra persona nace como
 *        propuesta y lo decide ella (salvo su líder). Es de todo el equipo interno: lo propio no lleva celda.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarMisTareas } from "@/lib/tareas/consultas";
import { crearTarea } from "@/lib/tareas/mutaciones";
import { CrearTarea } from "@/lib/tareas/schema";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  try {
    return NextResponse.json(await cargarMisTareas(p.ctx, p.clientes));
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
  const parsed = CrearTarea.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  try {
    return NextResponse.json(await crearTarea(p.ctx, p.clientes, parsed.data));
  } catch (e) {
    return respuestaDeError(e);
  }
}
