/**
 * POST /api/feedback/[id]/mensajes — un mensaje en la conversación de un reporte.
 *
 * Escriben quien reportó y quien revisa. Al otro lado le llega el aviso en «Para ti».
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { errorDeValidacion, leerCuerpo, respuestaDeError, sinTablas } from "@/lib/feedback/http";
import { responder } from "@/lib/feedback/mutations";
import { esRevisorDeFeedback } from "@/lib/feedback/reglas";
import { NuevoMensaje } from "@/lib/feedback/schema";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = NuevoMensaje.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);

  const { id } = await params;
  try {
    const m = await responder(id, { email: guard.user.email, esRevisor: esRevisorDeFeedback(guard.role) }, parsed.data.cuerpo);
    return NextResponse.json({ mensaje: m }, { status: 201 });
  } catch (e) {
    return respuestaDeError(e);
  }
}
