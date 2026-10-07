/**
 * /api/feedback/temas/[id] — un tema de la hoja de ruta. Solo quien revisa.
 *
 * GET: lo que muestra el panel del tema en la hoja de ruta: sus reportes y el prompt para Claude Code
 * (lib/feedback/prompt.ts).
 * PATCH: moverlo de columna o cambiarle el nombre. Al pasarlo a «En curso» o a «Listo», a cada persona que
 * lo pidió le llega el aviso.
 */
import { NextRequest, NextResponse } from "next/server";
import { errorDeValidacion, guardRevisorDeFeedback, leerCuerpo, respuestaDeError, sinTablas } from "@/lib/feedback/http";
import { cambiarTema } from "@/lib/feedback/mutations";
import { promptDeTema } from "@/lib/feedback/prompt";
import { reportesDelTema, temaParaElPrompt } from "@/lib/feedback/queries";
import { CambiarTema } from "@/lib/feedback/schema";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardRevisorDeFeedback();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const { id } = await params;
  try {
    const [tema, reportes] = await Promise.all([temaParaElPrompt(id), reportesDelTema(id)]);
    if (!tema) return NextResponse.json({ error: "Ese tema ya no existe." }, { status: 404 });
    return NextResponse.json({ prompt: promptDeTema(tema), reportes });
  } catch (e) {
    return respuestaDeError(e);
  }
}

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
