/**
 * POST /api/tareas/proyectos — crea un proyecto de tareas en el espacio de tu equipo (o en uno libre donde estás).
 * Un proyecto de tareas NO es un proyecto de HubSpot: a lo sumo lo referencia.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { crearProyecto } from "@/lib/tareas/mutaciones";
import { CrearProyecto } from "@/lib/tareas/schema";

export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = CrearProyecto.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  try {
    return NextResponse.json(await crearProyecto(p.ctx, p.clientes, parsed.data));
  } catch (e) {
    return respuestaDeError(e);
  }
}
