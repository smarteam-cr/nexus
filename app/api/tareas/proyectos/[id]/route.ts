/**
 * /api/tareas/proyectos/[id] — un proyecto de tareas.
 *
 * GET   → el proyecto y las tareas que ves de él («ves 1 de 4»).
 * PATCH → editar (con `version`). Cambiar su cliente lo cambia en todas sus tareas.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarProyecto } from "@/lib/tareas/consultas";
import { editarProyecto } from "@/lib/tareas/mutaciones";
import { PatchProyecto } from "@/lib/tareas/schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const { id } = await params;
  try {
    return NextResponse.json(await cargarProyecto(p.ctx, p.clientes, id));
  } catch (e) {
    return respuestaDeError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = PatchProyecto.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const { id } = await params;
  try {
    await editarProyecto(p.ctx, p.clientes, id, parsed.data.version, parsed.data.cambios);
    return NextResponse.json(await cargarProyecto(p.ctx, p.clientes, id));
  } catch (e) {
    return respuestaDeError(e);
  }
}
