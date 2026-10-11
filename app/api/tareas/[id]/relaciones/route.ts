/**
 * /api/tareas/[id]/relaciones — dependencias de una tarea (docs/tareas-plan.md §5.7).
 *
 * POST   { esperaA } → la tarea espera a otra (esa la bloquea). Solo con una que ves; nunca un círculo (409).
 * DELETE ?esperaA=   → deja de esperarla.
 * Lo puede quien puede editar la tarea. Devuelve la tarea al día.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cargarTarea } from "@/lib/tareas/consultas";
import { dejarDeEsperar, esperarA } from "@/lib/tareas/mutaciones";
import { EsperarA } from "@/lib/tareas/schema";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = EsperarA.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const { id } = await params;
  try {
    await esperarA(p.ctx, id, parsed.data.esperaA);
    return NextResponse.json(await cargarTarea(p.ctx, p.clientes, id));
  } catch (e) {
    return respuestaDeError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const parsed = EsperarA.safeParse({ esperaA: req.nextUrl.searchParams.get("esperaA") ?? "" });
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const { id } = await params;
  try {
    await dejarDeEsperar(p.ctx, id, parsed.data.esperaA);
    return NextResponse.json(await cargarTarea(p.ctx, p.clientes, id));
  } catch (e) {
    return respuestaDeError(e);
  }
}
