/**
 * PATCH /api/feedback/temas/[id] — mover un tema de columna o cambiarle el nombre. Solo quien revisa.
 *
 * Al pasarlo a «En curso» o a «Listo», a cada persona que lo pidió le llega el aviso.
 */
import { NextRequest, NextResponse } from "next/server";
import { errorDeValidacion, guardRevisorDeFeedback, leerCuerpo, respuestaDeError, sinTablas } from "@/lib/feedback/http";
import { cambiarTema } from "@/lib/feedback/mutations";
import { CambiarTema } from "@/lib/feedback/schema";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardRevisorDeFeedback();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = CambiarTema.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);

  const { id } = await params;
  try {
    await cambiarTema(id, parsed.data, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respuestaDeError(e);
  }
}
