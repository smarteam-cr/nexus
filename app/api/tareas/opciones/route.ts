/**
 * GET /api/tareas/opciones[?clientId=] — lo que se puede elegir en una tarea: personas, empresas (las que ves, de
 * cualquier tipo, más Smarteam), equipos con líder y proyectos. Con `clientId`, además sus proyectos de HubSpot
 * activos; 404 si esa empresa no está entre las que ves.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarOpciones } from "@/lib/tareas/consultas";

export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  try {
    return NextResponse.json(await cargarOpciones(p.ctx, p.clientes, req.nextUrl.searchParams.get("clientId")));
  } catch (e) {
    return respuestaDeError(e);
  }
}
