/**
 * GET /api/tareas/lecturas/[id] — cómo va una lectura y lo que salió. La ve quien la pidió o quien puede leer esa
 * reunión (el chokepoint lo decide al momento). El resumen no trae citas.
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { estadoDeLectura } from "@/lib/tareas/lectura";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const { id } = await params;
  try {
    return NextResponse.json(await estadoDeLectura(p.ctx, p.clientes, id));
  } catch (e) {
    return respuestaDeError(e);
  }
}
