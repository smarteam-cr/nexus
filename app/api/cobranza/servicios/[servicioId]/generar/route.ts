/**
 * /api/cobranza/servicios/[servicioId]/generar — materializar los cobros.
 *   POST → engine (materialize → reconcile → catch-up) + transacción. IDEMPOTENTE:
 *          re-apretarlo sin cambios de plan = 0 mutaciones. Los catch-up nacen
 *          PROGRAMADO + alerta INCONSISTENCIA_CICLO (Alex confirma — nunca COBRADO solo).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { generateCobros, CobranzaError } from "@/lib/cobranza/mutations";
import { crDateParts } from "@/lib/jobs/time";

type Params = { params: Promise<{ servicioId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { servicioId } = await params;

  try {
    const result = await generateCobros(
      servicioId,
      guard.user.email,
      crDateParts(new Date()).dateKey,
    );
    return NextResponse.json({ result });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
