/**
 * GET /api/tiempos/exportar?periodo=30|56|todo — las preguntas de tiempo del período, en CSV. Solo dirección.
 * Lleva el rol de quien respondió y no su nombre: sirve para calibrar la carga, no para evaluar a nadie.
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardRevisorDeFeedback } from "@/lib/feedback/http";
import { csvDeTiempos, leerPeriodo } from "@/lib/tiempos/resultados";
import { SQL_DE_TIEMPOS, tiemposDisponible } from "@/lib/tiempos/servidor";

export async function GET(req: NextRequest) {
  const guard = await guardRevisorDeFeedback();
  if (guard instanceof NextResponse) return guard;
  if (!tiemposDisponible()) {
    return NextResponse.json({ error: `Los tiempos todavía no están disponibles: falta aplicar ${SQL_DE_TIEMPOS}.` }, { status: 503 });
  }
  const periodo = leerPeriodo(req.nextUrl.searchParams.get("periodo"));
  const cuerpo = await csvDeTiempos(periodo);
  const hoy = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${cuerpo}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tiempos-${periodo}-${hoy}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
