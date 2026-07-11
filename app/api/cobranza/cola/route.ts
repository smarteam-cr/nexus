/**
 * /api/cobranza/cola — la cola de cobros pendientes (landing del módulo).
 *   GET → { cola: ColaCobroRow[] } — cobros no-COBRADO de cuentas dentro de la
 *   operación, planos y accionables. Mismo universo que la proyección.
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN) — enforcement server-side.
 */
import { NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { loadColaCobros } from "@/lib/cobranza/queries";
import { crDateParts } from "@/lib/jobs/time";

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const todayISO = crDateParts(new Date()).dateKey; // "hoy" = día calendario CR
  return NextResponse.json({ cola: await loadColaCobros(todayISO) });
}
