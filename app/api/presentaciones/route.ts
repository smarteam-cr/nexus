/**
 * GET /api/presentaciones — las últimas respuestas a «¿Cuándo lo presentas?» de los cuatro documentos, para Feedback ›
 * Encuestas › Automáticas (2026-10-14). Solo dirección. La exportación completa: /api/presentaciones/exportar.
 */
import { NextResponse } from "next/server";
import { guardRevisorDeFeedback } from "@/lib/feedback/http";
import { presentacionesDisponible, SQL_DE_PRESENTACIONES, ultimasRespuestas } from "@/lib/presentaciones/servidor";

export async function GET() {
  const guard = await guardRevisorDeFeedback();
  if (guard instanceof NextResponse) return guard;
  if (!presentacionesDisponible()) {
    return NextResponse.json({ error: `Las fechas de presentación todavía no están disponibles: falta aplicar ${SQL_DE_PRESENTACIONES}.` }, { status: 503 });
  }
  return NextResponse.json({ respuestas: await ultimasRespuestas() });
}
