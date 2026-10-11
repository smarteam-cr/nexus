/**
 * POST /api/tiempos/arranque — manda la encuesta de arranque (cuánto te toma normalmente cada tarea clave). Solo quien
 * revisa el feedback, desde Feedback › Encuestas. Mandarla de nuevo solo suma a quien todavía no la tenía.
 */
import { NextResponse } from "next/server";
import { guardRevisorDeFeedback } from "@/lib/feedback/http";
import { mandarEncuestaDeArranque } from "@/lib/tiempos/arranque";
import { SQL_DE_TIEMPOS, tiemposDisponible } from "@/lib/tiempos/servidor";

export async function POST() {
  const guard = await guardRevisorDeFeedback();
  if (guard instanceof NextResponse) return guard;
  if (!tiemposDisponible()) {
    return NextResponse.json({ error: `Los tiempos todavía no están disponibles: falta aplicar ${SQL_DE_TIEMPOS}.` }, { status: 503 });
  }
  const r = await mandarEncuestaDeArranque(guard.user.email);
  return NextResponse.json(r);
}
