/**
 * /api/escala/comentarios/[id] — editar o borrar un comentario.
 *
 * Editar: su autor, mientras siga abierto y sin respuestas. Borrar: eso mismo, o el responsable de
 * la escala. Las reglas viven en `lib/escala/comentarios/reglas.ts`; acá se aplican.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { autoriaPorId, borrarComentario, editarComentario } from "@/lib/escala/comentarios/consultas";
import { EditarComentario } from "@/lib/escala/comentarios/esquema";
import { errorDeValidacion, leerCuerpo, sinTablas } from "@/lib/escala/comentarios/http";
import { puedeBorrarComentario, puedeEditarComentario } from "@/lib/escala/comentarios/reglas";

const NO_EXISTE = () => NextResponse.json({ error: "Ese comentario ya no existe." }, { status: 404 });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = EditarComentario.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);

  const { id } = await params;
  const autoria = await autoriaPorId(id);
  if (!autoria) return NO_EXISTE();
  if (!puedeEditarComentario(autoria, guard.user.email)) {
    return NextResponse.json(
      { error: "Solo su autor lo edita, y mientras siga abierto y sin respuestas." },
      { status: 403 },
    );
  }
  await editarComentario(id, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const { id } = await params;
  const autoria = await autoriaPorId(id);
  if (!autoria) return NO_EXISTE();
  if (!puedeBorrarComentario(autoria, guard.user.email)) {
    return NextResponse.json(
      { error: "Ya tiene respuestas o cambió de estado: queda como evidencia. Solo el responsable de la escala lo borra." },
      { status: 403 },
    );
  }
  await borrarComentario(id);
  return NextResponse.json({ ok: true });
}
