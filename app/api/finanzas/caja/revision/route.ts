/**
 * /api/finanzas/caja/revision — «Ya revisé la caja de hoy». Una por día de Costa Rica; volver a marcarla la actualiza.
 *   POST → revisionSchema.
 * ⚠ Lo primero es la guarda de «Caja y pagos» con acción de editar.
 */
import { NextResponse, type NextRequest } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { revisionSchema } from "@/lib/finanzas/caja/esquemas";
import { leerCuerpo, responderError } from "@/lib/finanzas/caja/http";
import { marcarRevision } from "@/lib/finanzas/caja/mutaciones-server";
import { crDateParts } from "@/lib/jobs/time";

export async function POST(req: NextRequest) {
  const guard = await guardCostosAccess({ porPersona: { section: "tesoreria", action: "write" } });
  if (guard instanceof NextResponse) return guard;
  const body = await leerCuerpo(req, revisionSchema);
  if (body instanceof NextResponse) return body;
  try {
    const ahora = new Date();
    await marcarRevision(crDateParts(ahora).dateKey, guard.user.email, body.nota, ahora);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e);
  }
}
