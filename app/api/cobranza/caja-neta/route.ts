/**
 * /api/cobranza/caja-neta — entra − sale por bucket (fase 4).
 *   GET → { cajaNeta: CajaNetaDTO } — ingresos proyectados menos costos
 *   recurrentes estimados, CRC y USD SIEMPRE separados; vencidos aparte.
 * ⚠ PRIVACIDAD: guardCostosAccess como PRIMERA línea — el agregado de costos también
 * es dato sensible: SUPER_ADMIN, o quien tenga «Caja y pagos» en su permiso POR PERSONA
 * (2026-11-13). Un ADMIN sin esa celda no lo ve ni por acá. A quien no ve la planilla (ni Super Admin ni la celda
 * `planilla`), lo que sale va con los salarios juntos en una sola moneda (`personalJunto`, lib/cobranza/queries.ts): si
 * no, restando lo que la caja muestra aparte quedaba la planilla en dólares de la quincena.
 */
import { NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { puedePorPersona } from "@/lib/auth/salarios-por-persona";
import { loadCajaNeta } from "@/lib/cobranza/queries";
import { crDateParts } from "@/lib/jobs/time";

export async function GET() {
  // «Caja y pagos» por persona también la lee (2026-11-13): son totales por quincena, sin un costo suelto.
  const guard = await guardCostosAccess({ porPersona: { section: "tesoreria", action: "read" } });
  if (guard instanceof NextResponse) return guard;
  const todayISO = crDateParts(new Date()).dateKey; // "hoy" = día calendario CR
  const veSalarios = puedePorPersona(guard.role, guard.teamMember, { section: "planilla", action: "read" });
  return NextResponse.json({ cajaNeta: await loadCajaNeta(todayISO, { personalJunto: !veSalarios }) });
}
