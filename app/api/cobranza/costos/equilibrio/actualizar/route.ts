/**
 * /api/cobranza/costos/equilibrio/actualizar — traer lo último y recargar el punto de equilibrio.
 *   POST → vuelve a copiar las ventas ganadas de HubSpot, las facturas de Odoo y lo de Mercury (las copias que
 *          normalmente se hacen una vez por día) y devuelve el reporte recién armado, con qué pasó con cada fuente.
 *          { reporte: ReporteAnualDTO, fuentes: FuenteActualizada[] }
 *
 * ⚠ PRIVACIDAD: `guardCostosAccess` (SOLO SUPER_ADMIN) como PRIMERA línea, igual que el GET de al lado: devuelve el
 * mismo reporte, con planilla y estructura de costos. Vive bajo `costos/` para que el escaneo estructural de
 * costos-privacy.test.ts la vigile.
 *
 * ⛔ Solo LEE HubSpot, Odoo y Mercury. No toca cobros, gasto ni planilla. Una fuente caída no tumba la respuesta: el reporte
 * se arma igual con lo que había, y `fuentes` dice cuál no se pudo actualizar.
 */
import { NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { loadReporteAnual } from "@/lib/cobranza";
import { actualizarFuentesDelTablero } from "@/lib/finanzas/actualizar-tablero-server";
import { crDateParts } from "@/lib/jobs/time";

export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;

  // "Hoy" = día calendario de Costa Rica, igual que en el GET y en la página.
  const hoy = crDateParts(new Date());
  const anio = Number(hoy.dateKey.slice(0, 4));
  const fuentes = await actualizarFuentesDelTablero(guard.user.email, anio);
  const reporte = await loadReporteAnual(anio, hoy.dateKey);
  return NextResponse.json({ reporte, fuentes });
}
