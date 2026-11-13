/**
 * /api/finanzas/caja/saldos — cargar el saldo de una cuenta un día (uno por cuenta y día: volver a cargarlo lo corrige).
 *   POST → saldoSchema. El autor sale del guard, nunca del cuerpo.
 * ⚠ Lo primero es la guarda de «Caja y pagos» con acción de editar.
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { saldoSchema } from "@/lib/finanzas/caja/esquemas";
import { leerCuerpo, responderError } from "@/lib/finanzas/caja/http";
import { guardarSaldo } from "@/lib/finanzas/caja/mutaciones-server";

export async function POST(req: NextRequest) {
  const guard = await guardCostosAccess({ porPersona: { section: "tesoreria", action: "write" } });
  if (guard instanceof NextResponse) return guard;
  const body = await leerCuerpo(req, saldoSchema);
  if (body instanceof NextResponse) return body;
  try {
    await guardarSaldo(body, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e);
  }
}
