/**
 * /api/cobranza/costos/pagos-planilla/completar — «Completar las que faltan» del historial de planilla (2026-10-06).
 *   POST → genera de una vez las quincenas que no están en el libro, de la siguiente a la última generada hasta la de
 *          hoy, cada una con el salario que regía en ella (`completarQuincenas`). Todas quedan PENDIENTES.
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) PRIMERA línea del handler — son salarios.
 */
import { NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { completarQuincenas, CobranzaError } from "@/lib/cobranza/mutations";
import { crDateParts } from "@/lib/jobs/time";

export async function POST() {
  const guard = await guardCostosAccess({ porPersona: { section: "planilla", action: "write" } });
  if (guard instanceof NextResponse) return guard;
  try {
    const resultado = await completarQuincenas(crDateParts(new Date()).dateKey);
    return NextResponse.json({ resultado }, { status: 201 });
  } catch (e) {
    if (e instanceof CobranzaError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[cobranza/planilla] error al completar quincenas (detalle omitido a propósito)");
    throw e;
  }
}
