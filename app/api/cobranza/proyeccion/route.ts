/**
 * /api/cobranza/proyeccion — proyección de ingresos ("plata que viene").
 *   GET → ProyeccionIngresos: vencidos en riesgo + buckets quincena/mes con
 *         totales CRC y USD SEPARADOS (jamás se suman ni se convierten).
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN) — enforcement server-side.
 */
import { NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { loadProyeccion } from "@/lib/cobranza/queries";
import { crDateParts } from "@/lib/jobs/time";

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const todayISO = crDateParts(new Date()).dateKey; // "hoy" = día calendario CR
  return NextResponse.json({ proyeccion: await loadProyeccion(todayISO) });
}
