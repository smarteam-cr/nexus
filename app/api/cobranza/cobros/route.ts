/**
 * /api/cobranza/cobros — creación de un cobro individual.
 *   POST → PAGO MANUAL: crea un Cobro origen=MANUAL sobre un servicio existente y
 *          lo marca COBRADO (createCobroManual → cambiarEstadoCobro, INV3).
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN) — enforcement server-side.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { createCobroManual, CobranzaError } from "@/lib/cobranza/mutations";
import { cobroManualSchema } from "@/lib/cobranza/schema";

export async function POST(req: NextRequest) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = cobroManualSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    await createCobroManual(parsed.data, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
