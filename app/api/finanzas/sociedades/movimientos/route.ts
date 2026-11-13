/**
 * /api/finanzas/sociedades/movimientos — POST: anotar lo que una sociedad de Smarteam le debe a otra y no está en Odoo
 * (2026-11-13). Queda a nombre de quien lo anota. Solo dirección (guardSupervisionFinanzas).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSupervisionFinanzas } from "@/lib/auth/api-guards";
import { anotarMovimiento } from "@/lib/sociedades/server";
import { anotarMovimientoSchema } from "@/lib/sociedades/schema";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await guardSupervisionFinanzas();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, anotarMovimientoSchema);
  if (data instanceof NextResponse) return data;
  try {
    await anotarMovimiento({ ...data, factura: data.factura ?? null }, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "sociedades/movimientos");
  }
}
