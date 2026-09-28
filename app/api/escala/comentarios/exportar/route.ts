/**
 * GET /api/escala/comentarios/exportar?formato=md|csv — los cambios pendientes, con las columnas de
 * la tabla «Cambios pendientes» del manual de operación. Es del responsable de la escala.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { leerDocumentoPublicado } from "@/lib/escala/documento/vigente";
import { cambiosPendientes } from "@/lib/escala/comentarios/consultas";
import { columnasDelManual, COLUMNAS_DEL_MANUAL_DE_HOY, csv, filasDelManual, tablaMarkdown } from "@/lib/escala/comentarios/exportar";
import { sinTablas } from "@/lib/escala/comentarios/http";
import { esResponsable } from "@/lib/escala/comentarios/reglas";

export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  if (!esResponsable(guard.user.email)) {
    return NextResponse.json({ error: "Exportar los cambios pendientes es del responsable de la escala." }, { status: 403 });
  }
  const faltan = sinTablas();
  if (faltan) return faltan;

  const [pendientes, manual] = await Promise.all([cambiosPendientes(), leerDocumentoPublicado("manual")]);
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
}
