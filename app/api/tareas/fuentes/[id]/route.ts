/**
 * /api/tareas/fuentes/[id] — una serie del sprint (ficha A, 2026-10-17).
 *
 * PATCH  → pausarla o reanudarla, cambiar si es planning o cierre, y quiénes están. Solo quien lidera el sprint.
 * DELETE → quitarla. Lo que ya se leyó queda.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { cambiarFuente, quitarFuente } from "@/lib/tareas/fuentes-server";
import { CambiarFuente } from "@/lib/tareas/schema";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = CambiarFuente.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const { id } = await params;
  try {
    await cambiarFuente(p.ctx, id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const { id } = await params;
  try {
    await quitarFuente(p.ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e);
  }
}
