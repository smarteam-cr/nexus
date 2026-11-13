/**
 * /api/finanzas/caja/compromisos — anotar un pago comprometido o apartar plata (reserva).
 *   POST → compromisoSchema. El autor sale del guard.
 * ⚠ Lo primero es la guarda de «Caja y pagos» con acción de editar.
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { compromisoSchema } from "@/lib/finanzas/caja/esquemas";
import { leerCuerpo, responderError } from "@/lib/finanzas/caja/http";
import { crearCompromiso } from "@/lib/finanzas/caja/mutaciones-server";

export async function POST(req: NextRequest) {
  const guard = await guardCostosAccess({ porPersona: { section: "tesoreria", action: "write" } });
  if (guard instanceof NextResponse) return guard;
  const body = await leerCuerpo(req, compromisoSchema);
  if (body instanceof NextResponse) return body;
  try {
    const c = await crearCompromiso(body, guard.user.email);
    return NextResponse.json({ ok: true, id: c.id });
  } catch (e) {
    return responderError(e);
  }
}
