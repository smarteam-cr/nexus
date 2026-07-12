/**
 * /api/cobranza/costos/movimientos — historia de altas/bajas/cambios de los
 * costos recurrentes (fase 4.5). Append-only, orden fechaEfectiva desc.
 *   GET → { movimientos: CostoMovimientoDTO[] }.
 * ⚠ PRIVACIDAD: lleva montos de salarios — guardCostosAccess (SOLO SUPER_ADMIN)
 * como PRIMERA línea. Está bajo /costos → el escaneo estructural lo cubre.
 */
import { NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { loadMovimientosCostos } from "@/lib/cobranza/queries";

export async function GET() {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ movimientos: await loadMovimientosCostos() });
}
