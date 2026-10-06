/**
 * /api/finanzas/tarjetas — las tarjetas de la empresa, con sus costos que NO son salarios (rediseño de Finanzas, 2026-10-03).
 *   GET  → { tarjetas } con los costos asignados filtrados en la consulta.
 *   POST → agrega una tarjeta.
 * ⚠ PRIVACIDAD: `guardGastosAccess`/`guardGastosEditor` como PRIMERA línea (costos-privacy.test.ts, P5).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardGastosAccess, guardGastosEditor } from "@/lib/auth/api-guards";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { loadTarjetas } from "@/lib/cobranza/queries";
import { createTarjeta } from "@/lib/cobranza/mutations";
import { tarjetaCreateSchema } from "@/lib/cobranza/schema";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";
import { crDateParts } from "@/lib/jobs/time";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await guardGastosAccess();
  if (guard instanceof NextResponse) return guard;
  // Los cortes se cuentan solo para quien supervisa: es quien puede eliminar una tarjeta, y la confirmación los nombra.
  const hoyISO = crDateParts(new Date()).dateKey;
  return NextResponse.json({ tarjetas: await loadTarjetas(hoyISO, { sinSalarios: true, conCortes: isCostosRole(guard.role) }) });
}

export async function POST(req: NextRequest) {
  const guard = await guardGastosEditor();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, tarjetaCreateSchema);
  if (data instanceof NextResponse) return data;
  try {
    return NextResponse.json({ tarjeta: await createTarjeta(data) }, { status: 201 });
  } catch (e) {
    return responderError(e, "tarjetas");
  }
}
