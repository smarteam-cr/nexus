/**
 * /api/tareas/[id]/comentarios — conversar sobre una tarea (docs/tareas-plan.md §5.2, punto 8).
 *
 * GET  → los comentarios, del más viejo al más nuevo. Los ve quien ve la tarea (404 si no).
 * POST → comentar. Avisa a los otros involucrados (responsable, quien la pidió, quien la creó), nunca a quien escribió.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarComentarios } from "@/lib/tareas/consultas";
import { comentar } from "@/lib/tareas/mutaciones";
import { Comentar } from "@/lib/tareas/schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const { id } = await params;
  try {
    return NextResponse.json({ comentarios: await cargarComentarios(p.ctx, id) });
  } catch (e) {
    return respuestaDeError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = Comentar.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const { id } = await params;
  try {
    return NextResponse.json(await comentar(p.ctx, id, parsed.data.cuerpo));
  } catch (e) {
    return respuestaDeError(e);
  }
}
