/**
 * POST /api/escala/comentarios/[id]/respuestas — responder un comentario.
 *
 * Responde cualquiera del equipo. Si responde el responsable de la escala y el comentario estaba
 * abierto, pasa a «respondido».
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { autoriaPorId, responder } from "@/lib/escala/comentarios/consultas";
import { Responder } from "@/lib/escala/comentarios/esquema";
import { errorDeValidacion, leerCuerpo, sinTablas } from "@/lib/escala/comentarios/http";
import { esResponsable } from "@/lib/escala/comentarios/reglas";

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
  if (!(await autoriaPorId(id))) return NextResponse.json({ error: "Ese comentario ya no existe." }, { status: 404 });
  await responder({
    comentarioId: id,
    cuerpo: parsed.data.cuerpo,
    email: guard.user.email,
    esResponsable: esResponsable(guard.user.email),
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
