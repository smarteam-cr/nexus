/**
 * GET /api/feedback/cambios-de-la-escala?formato=md|csv — lo que se mandó desde la escala y está en la
 * hoja de ruta, con las columnas de «Cambios pendientes» del manual de operación. Solo quien revisa
 * (SUPER_ADMIN). Antes vivía en /api/escala/comentarios/exportar, que se fue con el sistema viejo
 * de comentarios de la escala (2026-10-05).
 */
import { NextRequest, NextResponse } from "next/server";
import { leerDocumentoPublicado } from "@/lib/escala/documento/vigente";
import { cambiosDeLaEscala } from "@/lib/feedback/escala-server";
import { guardRevisorDeFeedback, respuestaDeError, sinTablas } from "@/lib/feedback/http";
import { columnasDelManual, COLUMNAS_DEL_MANUAL_DE_HOY, csv, filasDelManual, tablaMarkdown } from "@/lib/feedback/manual-de-la-escala";

export async function GET(req: NextRequest) {
  const guard = await guardRevisorDeFeedback();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  try {
    const [cambios, manual] = await Promise.all([cambiosDeLaEscala(), leerDocumentoPublicado("manual")]);
    const columnas = columnasDelManual(manual?.texto) ?? [...COLUMNAS_DEL_MANUAL_DE_HOY];
    const filas = filasDelManual(cambios);
    const hoy = new Date().toISOString().slice(0, 10);

    if (req.nextUrl.searchParams.get("formato") === "csv") {
      return new NextResponse(csv(filas, columnas), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="cambios-de-la-escala-${hoy}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({ markdown: tablaMarkdown(filas, columnas), filas: filas.length });
  } catch (e) {
    return respuestaDeError(e);
  }
}
