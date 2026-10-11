/**
 * PATCH /api/tareas/comentarios/[id] — editar un comentario (solo quien lo escribió) o quitarlo (también un Super
 * Admin). No se borra: se archiva.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, prepararTareas, respuestaDeError } from "@/lib/tareas/http";
import { archivarComentario, editarComentario } from "@/lib/tareas/mutaciones";
import { PatchComentario } from "@/lib/tareas/schema";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const p = await prepararTareas(guard);
  if (p instanceof NextResponse) return p;
  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = PatchComentario.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);
  const { id } = await params;
  try {
    if (parsed.data.accion === "editar") await editarComentario(p.ctx, id, parsed.data.cuerpo);
    else await archivarComentario(p.ctx, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e);
  }
}
