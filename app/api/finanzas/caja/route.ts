/**
 * /api/finanzas/caja — «Dónde está la plata» (2026-11-13).
 *   GET → { caja: CajaDTO }
 *
 * ⚠ PRIVACIDAD: lo primero es `guardCostosAccess` con la excepción por persona de «Caja y pagos» (`tesoreria`): Super
 * Admin, o quien la tenga en su override de /team. La planilla viaja sumada (lib/finanzas/caja/caja-server.ts).
 */
import { NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { cargarCaja } from "@/lib/finanzas/caja/caja-server";
import { responderError } from "@/lib/finanzas/caja/http";
import { crDateParts } from "@/lib/jobs/time";

export async function GET() {
  const guard = await guardCostosAccess({ porPersona: { section: "tesoreria", action: "read" } });
  if (guard instanceof NextResponse) return guard;
  try {
    return NextResponse.json({ caja: await cargarCaja(crDateParts(new Date()).dateKey) });
  } catch (e) {
    return responderError(e);
  }
}
