/**
 * POST /api/escala/comentarios/[id]/respuestas — responder un comentario.
 *
 * Responde cualquiera del equipo, en la escala. Responder no cambia el estado: eso se decide en la
 * bandeja de /feedback (desde el 2026-10-05). A quien lo escribió le llega el aviso en «Para ti».
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { autoriaPorId, responder } from "@/lib/feedback/escala-server";
import { esRevisorDeFeedback } from "@/lib/feedback/reglas";
import { Responder } from "@/lib/escala/comentarios/esquema";
import { errorDeValidacion, leerCuerpo, respuestaDeError, sinTablas } from "@/lib/escala/comentarios/http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = Responder.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);

  const { id } = await params;
  try {
    if (!(await autoriaPorId(id))) return NextResponse.json({ error: "Ese comentario ya no existe." }, { status: 404 });
    await responder({ comentarioId: id, cuerpo: parsed.data.cuerpo, email: guard.user.email, esRevisor: esRevisorDeFeedback(guard.role) });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return respuestaDeError(e);
  }
}
