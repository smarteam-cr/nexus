/**
 * /api/finanzas/caja/cuentas/[cuentaId] — renombrar una cuenta, ponerle la sociedad o sacarla de la cuenta (activa).
 *   PATCH → cuentaCambioSchema. Nunca se borra: sacarla deja sus saldos.
 * ⚠ Lo primero es la guarda de «Caja y pagos» con acción de editar.
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { cuentaCambioSchema } from "@/lib/finanzas/caja/esquemas";
import { leerCuerpo, responderError } from "@/lib/finanzas/caja/http";
import { cambiarCuenta } from "@/lib/finanzas/caja/mutaciones-server";

type Params = { params: Promise<{ cuentaId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCostosAccess({ porPersona: { section: "tesoreria", action: "write" } });
  if (guard instanceof NextResponse) return guard;
  const { cuentaId } = await params;
  const body = await leerCuerpo(req, cuentaCambioSchema);
  if (body instanceof NextResponse) return body;
  try {
    await cambiarCuenta(cuentaId, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e);
  }
}
