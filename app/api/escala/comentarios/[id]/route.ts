/**
 * /api/escala/comentarios/[id] — editar o borrar un comentario.
 *
 * Editar: su autor, mientras siga sin revisar y sin respuestas. Borrar: eso mismo, o quien revisa el
 * feedback (cualquier super admin, desde el 2026-10-05). Las reglas viven en
 * `lib/escala/comentarios/reglas.ts`; acá se aplican.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { autoriaPorId, borrarComentario, editarComentario } from "@/lib/feedback/escala-server";
import { esRevisorDeFeedback } from "@/lib/feedback/reglas";
import { EditarComentario } from "@/lib/escala/comentarios/esquema";
import { errorDeValidacion, leerCuerpo, respuestaDeError, sinTablas } from "@/lib/escala/comentarios/http";
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
  try {
    const autoria = await autoriaPorId(id);
    if (!autoria) return NO_EXISTE();
    if (!puedeEditarComentario(autoria, guard.user.email)) {
      return NextResponse.json({ error: "Solo su autor lo edita, y mientras siga sin revisar y sin respuestas." }, { status: 403 });
    }
    await editarComentario(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const { id } = await params;
  try {
    const autoria = await autoriaPorId(id);
    if (!autoria) return NO_EXISTE();
    if (!puedeBorrarComentario(autoria, guard.user.email, esRevisorDeFeedback(guard.role))) {
      return NextResponse.json(
        { error: "Ya tiene respuestas o ya se decidió: queda como evidencia. Solo lo borra quien revisa el feedback." },
        { status: 403 },
      );
    }
    await borrarComentario(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e);
  }
}
