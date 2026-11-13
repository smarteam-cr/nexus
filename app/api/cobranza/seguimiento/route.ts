/**
 * /api/cobranza/seguimiento — la pestaña «Seguimiento» de Cobranza (2026-11-13): los negocios ganados sin cobro con su
 * responsable, los conectores en mora, los contratos recurrentes y el resumen del paso a producción.
 *   GET → SeguimientoDeCobranza (lib/cobranza/seguimiento-server.ts).
 * Acceso: guardCobranzaAccess (`cobranza.read`).
 */
import { NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { cargarSeguimiento } from "@/lib/cobranza/seguimiento-server";
import { crDateParts } from "@/lib/jobs/time";

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const hoy = crDateParts(new Date()).dateKey;
  return NextResponse.json(await cargarSeguimiento(hoy));
}
