/**
 * /api/finanzas/caja/cuentas — agregar una cuenta de banco que se carga a mano.
 *   POST → cuentaNuevaSchema. Las de Mercury las crea su copia.
 * ⚠ Lo primero es la guarda de «Caja y pagos» con acción de editar.
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { cuentaNuevaSchema } from "@/lib/finanzas/caja/esquemas";
import { leerCuerpo, responderError } from "@/lib/finanzas/caja/http";
import { crearCuenta } from "@/lib/finanzas/caja/mutaciones-server";

export async function POST(req: NextRequest) {
  const guard = await guardCostosAccess({ porPersona: { section: "tesoreria", action: "write" } });
  if (guard instanceof NextResponse) return guard;
  const body = await leerCuerpo(req, cuentaNuevaSchema);
  if (body instanceof NextResponse) return body;
  try {
    const c = await crearCuenta(body);
    return NextResponse.json({ ok: true, id: c.id });
  } catch (e) {
    return responderError(e);
  }
}
