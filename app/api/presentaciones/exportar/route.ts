/**
 * GET /api/presentaciones/exportar — TODAS las filas de «¿Cuándo lo presentas?» en CSV (también las fechas que leyó
 * Nexus en las reuniones y los «Ahora no»), para analizarlas aparte. Solo dirección.
 */
import { NextResponse } from "next/server";
import { guardRevisorDeFeedback } from "@/lib/feedback/http";
import { csvDePresentaciones } from "@/lib/presentaciones/reglas";
import { filasParaExportar, presentacionesDisponible, SQL_DE_PRESENTACIONES } from "@/lib/presentaciones/servidor";

export async function GET() {
  const guard = await guardRevisorDeFeedback();
  if (guard instanceof NextResponse) return guard;
  if (!presentacionesDisponible()) {
    return NextResponse.json({ error: `Las fechas de presentación todavía no están disponibles: falta aplicar ${SQL_DE_PRESENTACIONES}.` }, { status: 503 });
  }
  const cuerpo = csvDePresentaciones(await filasParaExportar());
  const hoy = new Date().toISOString().slice(0, 10);
  return new NextResponse(cuerpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="presentaciones-${hoy}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
