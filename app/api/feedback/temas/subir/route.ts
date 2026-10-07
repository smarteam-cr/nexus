/**
 * POST /api/feedback/temas/subir — «Ya se subió» (2026-10-07). Solo quien revisa.
 *
 * Después de una subida a producción, todo lo de «Listo» pasa a «En Nexus» y a cada persona que lo pidió le llega
 * en «Para ti» que ya lo puede probar (lib/feedback/mutations.ts › subirLoListo).
 */
import { NextResponse } from "next/server";
import { guardRevisorDeFeedback, respuestaDeError, sinTablas } from "@/lib/feedback/http";
import { subirLoListo } from "@/lib/feedback/mutations";

export async function POST() {
  const guard = await guardRevisorDeFeedback();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  try {
    return NextResponse.json(await subirLoListo(guard.user.email));
  } catch (e) {
    return respuestaDeError(e);
  }
}
