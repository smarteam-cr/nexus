/**
 * /api/cobranza/costos/equilibrio — el reporte anual de equilibrio.
 *   GET → { reporte: ReporteAnualDTO }
 *
 * ⚠ PRIVACIDAD: `guardCostosAccess` (SOLO SUPER_ADMIN) como PRIMERA línea. El reporte
 * junta ingresos con planilla y estructura de costos, así que toma la sensibilidad
 * máxima de lo que mezcla — un ADMIN no lo ve, y eso está decidido y escrito
 * (DECISIONS §El reporte anual de equilibrio).
 *
 * ⚠ Y por eso vive bajo `costos/`: el escaneo estructural de costos-privacy.test.ts
 * barre esta carpeta y exige el guard en cada handler. Colgarlo de otro lado lo
 * dejaría fuera de esa vigilancia sin que nadie lo note.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { loadReporteAnual } from "@/lib/cobranza";
import { reporteEquilibrioQuerySchema } from "@/lib/cobranza/schema";
import { crDateParts } from "@/lib/jobs/time";

export async function GET(req: NextRequest) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;

  const parsed = reporteEquilibrioQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  // "Hoy" = día calendario de Costa Rica. Decide qué mes es futuro y por lo tanto qué
  // entra al promedio del equilibrio: leerlo en UTC correría el corte un día.
  const hoy = crDateParts(new Date());
  const anio = parsed.data.anio ?? Number(hoy.dateKey.slice(0, 4));

  const reporte = await loadReporteAnual(anio, hoy.dateKey, {
    ventana: parsed.data.ventana,
    monedaPresentacion: parsed.data.moneda,
  });
  return NextResponse.json({ reporte });
}
