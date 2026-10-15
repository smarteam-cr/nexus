/**
 * GET /api/encuestas-de-cuenta/exportar?clave=… — TODOS los eventos de las preguntas sobre la cuenta, en CSV (también
 * cuándo se mostró y cuándo se dejó para después), para analizarlos aparte. Solo dirección. Sin clave, todas.
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardRevisorDeFeedback } from "@/lib/feedback/http";
import { csvDePreguntasDeCuenta, preguntasDeCuentaDisponible, SQL_DE_PREGUNTAS_DE_CUENTA } from "@/lib/encuestas-de-cuenta/servidor";
import { preguntaDe } from "@/lib/encuestas-de-cuenta/preguntas";

export async function GET(req: NextRequest) {
  const guard = await guardRevisorDeFeedback();
  if (guard instanceof NextResponse) return guard;
  if (!preguntasDeCuentaDisponible()) {
    return NextResponse.json(
      { error: `Las preguntas sobre los clientes todavía no están disponibles: falta aplicar ${SQL_DE_PREGUNTAS_DE_CUENTA}.` },
      { status: 503 },
    );
  }
  const pedida = req.nextUrl.searchParams.get("clave");
  const clave = pedida && preguntaDe(pedida) ? pedida : undefined;
  const cuerpo = await csvDePreguntasDeCuenta(clave);
  const hoy = new Date().toISOString().slice(0, 10);
  return new NextResponse(cuerpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="preguntas-sobre-los-clientes${clave ? `-${clave}` : ""}-${hoy}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
