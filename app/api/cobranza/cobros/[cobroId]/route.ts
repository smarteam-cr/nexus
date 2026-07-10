/**
 * /api/cobranza/cobros/[cobroId] — cambio de estado/campos de un cobro.
 *   PATCH → vía el CHOKEPOINT cambiarEstadoCobro (lib/cobranza/mutations.ts):
 *           COBRADO exige confirmación (setea confirmadoPor = email del guard — INV3);
 *           fechaProgramada/monto solo editables en PROGRAMADO.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { cambiarEstadoCobro, CobranzaError } from "@/lib/cobranza/mutations";
import { cobroPatchSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ cobroId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { cobroId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = cobroPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    await cambiarEstadoCobro(cobroId, parsed.data, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
