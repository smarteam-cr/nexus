import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { puedeBorrarComentario, puedeEditarComentario } from "@/lib/documentacion/comentarios";
import {
  borrarComentario,
  comentarioPorId,
  editarComentario,
} from "@/lib/documentacion/consultas-de-comentarios";
import { EditarComentario } from "@/lib/documentacion/esquema";

type Params = { params: Promise<{ hiloId: string; comentarioId: string }> };

/** El comentario, solo si es de ESE hilo: una URL armada a mano no mezcla hilos. */
async function comentarioDelHilo(params: Params["params"]) {
  const { hiloId, comentarioId } = await params;
  const comentario = await comentarioPorId(comentarioId);
  return comentario && comentario.hiloId === hiloId ? comentario : null;
}

/** PATCH — editar un comentario. Solo quien lo escribió. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const comentario = await comentarioDelHilo(params);
  if (!comentario) return NextResponse.json({ error: "Ese comentario ya no existe." }, { status: 404 });
  if (!puedeEditarComentario(guard.user.email, comentario.autorEmail)) {
    return NextResponse.json({ error: "Solo quien escribió el comentario lo edita." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }
  const parsed = EditarComentario.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  await editarComentario({ comentarioId: comentario.id, cuerpo: parsed.data.cuerpo });
  return NextResponse.json({ ok: true });
}

/** DELETE — borrar un comentario: quien lo escribió, Súper admin o CSL. El último se lleva el hilo. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const comentario = await comentarioDelHilo(params);
  if (!comentario) return NextResponse.json({ error: "Ese comentario ya no existe." }, { status: 404 });
  if (!puedeBorrarComentario(guard.user.email, guard.role, comentario.autorEmail)) {
    return NextResponse.json(
      { error: "Un comentario lo borra quien lo escribió, Súper admin o CSL." },
      { status: 403 },
    );
  }

  const r = await borrarComentario(comentario.id);
  return NextResponse.json({ ok: true, hiloBorrado: r.hiloBorrado });
}
