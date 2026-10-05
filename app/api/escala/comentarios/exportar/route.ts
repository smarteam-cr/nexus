/**
 * GET /api/escala/comentarios/exportar?formato=md|csv — los cambios de la escala que están en la hoja de
 * ruta de /feedback, con las columnas de la tabla «Cambios pendientes» del manual de operación. Es de
 * quien revisa el feedback (cualquier super admin, desde el 2026-10-05).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { leerDocumentoPublicado } from "@/lib/escala/documento/vigente";
import { cambiosPendientes } from "@/lib/feedback/escala-server";
import { esRevisorDeFeedback } from "@/lib/feedback/reglas";
import { columnasDelManual, COLUMNAS_DEL_MANUAL_DE_HOY, csv, filasDelManual, tablaMarkdown } from "@/lib/escala/comentarios/exportar";
import { respuestaDeError, sinTablas } from "@/lib/escala/comentarios/http";

export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  if (!esRevisorDeFeedback(guard.role)) {
    return NextResponse.json({ error: "Exportar los cambios de la escala es de quien revisa el feedback." }, { status: 403 });
  }
  const faltan = sinTablas();
  if (faltan) return faltan;

  try {
    // La fila del manual ya trae lo que hace falta (se llenó al llevarlo a la hoja de ruta): no se
    // necesita la escala para decir qué dice hoy cada ancla.
    const [pendientes, manual] = await Promise.all([cambiosPendientes(null), leerDocumentoPublicado("manual")]);
    const columnas = columnasDelManual(manual?.texto) ?? [...COLUMNAS_DEL_MANUAL_DE_HOY];
    const filas = filasDelManual(pendientes);
    const hoy = new Date().toISOString().slice(0, 10);

    if (req.nextUrl.searchParams.get("formato") === "csv") {
      return new NextResponse(csv(filas, columnas), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="cambios-pendientes-escala-${hoy}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json({ markdown: tablaMarkdown(filas, columnas), filas: filas.length });
  } catch (e) {
    return respuestaDeError(e);
  }
}
