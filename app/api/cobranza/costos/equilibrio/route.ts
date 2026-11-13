/**
 * /api/cobranza/costos/equilibrio — el reporte anual de equilibrio.
 *   GET → { reporte: ReporteAnualDTO }
 *
 * ⚠ PRIVACIDAD: `guardCostosAccess` como PRIMERA línea. El reporte junta ingresos con
 * planilla y estructura de costos, así que toma la sensibilidad máxima de lo que mezcla —
 * un ADMIN no lo ve (DECISIONS §El reporte anual de equilibrio), salvo quien tenga «Caja
 * y pagos» en su permiso POR PERSONA (2026-11-13, DECISIONS «La caja y los pagos»): la
 * planilla viaja sumada por mes, nunca por persona. Y a quien no ve salarios (ni Super
 * Admin ni la celda `planilla` en su override) el reporte le llega sin nombres ni montos
 * de costo sueltos (lib/finanzas/equilibrio-sin-salarios.ts): en un año sin tipo de
 * cambio esas listas eran el salario de cada persona.
 *
 * ⚠ Y por eso vive bajo `costos/`: el escaneo estructural de costos-privacy.test.ts
 * barre esta carpeta y exige el guard en cada handler. Colgarlo de otro lado lo
 * dejaría fuera de esa vigilancia sin que nadie lo note.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { puedePorPersona } from "@/lib/auth/salarios-por-persona";
import { loadReporteAnual } from "@/lib/cobranza";
import { anioDelReportePermitido, reporteEquilibrioQuerySchema } from "@/lib/cobranza/schema";
import { sinSalariosPorPersona } from "@/lib/finanzas/equilibrio-sin-salarios";
import { crDateParts } from "@/lib/jobs/time";

export async function GET(req: NextRequest) {
  // «Caja y pagos» por persona también lo lee (2026-11-13): el reporte trae la planilla sumada, no la de cada persona.
  const guard = await guardCostosAccess({ porPersona: { section: "tesoreria", action: "read" } });
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
  if (!anioDelReportePermitido(anio, hoy.dateKey)) {
    return NextResponse.json({ error: "Ese año no se puede pedir: el reporte cubre los dos años anteriores, el de hoy y el que viene." }, { status: 400 });
  }

  const reporte = await loadReporteAnual(anio, hoy.dateKey, {
    ventana: parsed.data.ventana,
    monedaPresentacion: parsed.data.moneda,
  });
  const veSalarios = puedePorPersona(guard.role, guard.teamMember, { section: "planilla", action: "read" });
  return NextResponse.json({ reporte: veSalarios ? reporte : sinSalariosPorPersona(reporte) });
}
