/**
 * /api/finanzas/caja/compromisos/[compromisoId] — marcar pagado (o el adelanto), anular, reabrir o editar.
 *   PATCH → accionDeCompromisoSchema. Nada se borra: anular deja la fila.
 * ⚠ Lo primero es la guarda de «Caja y pagos» con acción de editar.
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { accionDeCompromisoSchema } from "@/lib/finanzas/caja/esquemas";
import { leerCuerpo, responderError } from "@/lib/finanzas/caja/http";
import { accionSobreCompromiso } from "@/lib/finanzas/caja/mutaciones-server";

type Params = { params: Promise<{ compromisoId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCostosAccess({ porPersona: { section: "tesoreria", action: "write" } });
  if (guard instanceof NextResponse) return guard;
  const { compromisoId } = await params;
  const body = await leerCuerpo(req, accionDeCompromisoSchema);
  if (body instanceof NextResponse) return body;
  try {
    await accionSobreCompromiso(compromisoId, body, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e);
  }
}
