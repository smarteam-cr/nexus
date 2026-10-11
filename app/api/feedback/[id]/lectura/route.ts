/**
 * POST /api/feedback/[id]/lectura — marcar un reporte como leído o no leído en la Bandeja. Solo quien revisa.
 *
 * Abrirlo ya lo deja leído (GET /api/feedback/[id]); esto es para volver a dejarlo pendiente, o para darlo por
 * leído sin abrirlo (lib/feedback/mutations.ts › cambiarLectura).
 */
import { NextRequest, NextResponse } from "next/server";
import { errorDeValidacion, guardRevisorDeFeedback, leerCuerpo, respuestaDeError, sinTablas } from "@/lib/feedback/http";
import { cambiarLectura } from "@/lib/feedback/mutations";
import { MarcarLectura } from "@/lib/feedback/schema";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardRevisorDeFeedback();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const parsed = MarcarLectura.safeParse(body);
  if (!parsed.success) return errorDeValidacion(parsed.error.issues);

  const { id } = await params;
  try {
    return NextResponse.json(await cambiarLectura(id, parsed.data.leido));
  } catch (e) {
    return respuestaDeError(e);
  }
}
