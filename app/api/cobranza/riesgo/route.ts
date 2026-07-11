/**
 * /api/cobranza/riesgo — riesgo de pago en vivo (regla V1, sin ML).
 *   GET → { riesgo: RiesgoPagoItem[] } ordenado por excedente desc. Misma fuente
 *         que el digest y el reporter (buildCarteraEngineInput → computeRiesgoPago).
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN) — enforcement server-side.
 */
import { NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { loadRiesgo } from "@/lib/cobranza/queries";
import { crDateParts } from "@/lib/jobs/time";

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const todayISO = crDateParts(new Date()).dateKey; // "hoy" = día calendario CR
  return NextResponse.json({ riesgo: await loadRiesgo(todayISO) });
}
