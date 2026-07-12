/**
 * /api/cobranza/caja-neta — entra − sale por bucket (fase 4).
 *   GET → { cajaNeta: CajaNetaDTO } — ingresos proyectados menos costos
 *   recurrentes estimados, CRC y USD SIEMPRE separados; vencidos aparte.
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) como PRIMERA línea — el
 * agregado de costos también es dato sensible; ADMIN no lo ve ni por acá.
 */
import { NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { loadCajaNeta } from "@/lib/cobranza/queries";
import { crDateParts } from "@/lib/jobs/time";

export async function GET() {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const todayISO = crDateParts(new Date()).dateKey; // "hoy" = día calendario CR
  return NextResponse.json({ cajaNeta: await loadCajaNeta(todayISO) });
}
