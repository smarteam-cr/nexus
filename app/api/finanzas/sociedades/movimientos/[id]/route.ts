/**
 * /api/finanzas/sociedades/movimientos/[id] — PATCH (2026-11-13):
 *   { tipo: ACEPTAR, nota }     → «Está bien así»: sale de la lista de lo que no tiene factura, con el porqué escrito.
 *   { tipo: QUITAR_ACEPTACION } → vuelve a la lista.
 *   { tipo: ANULAR }            → anula algo anotado a mano (lo de Odoo se corrige en Odoo: 409).
 * Solo dirección (guardSupervisionFinanzas).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSupervisionFinanzas } from "@/lib/auth/api-guards";
import { cambiarMovimiento } from "@/lib/sociedades/server";
import { cambiarMovimientoSchema } from "@/lib/sociedades/schema";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardSupervisionFinanzas();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const data = await leerCuerpo(req, cambiarMovimientoSchema);
  if (data instanceof NextResponse) return data;
  try {
    await cambiarMovimiento(id, data, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "sociedades/movimiento");
  }
}
