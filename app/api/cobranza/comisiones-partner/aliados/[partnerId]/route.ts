/**
 * /api/cobranza/comisiones-partner/aliados/[partnerId] — editar y borrar un aliado.
 *
 * Borrar NO borra sus pagos (FK SetNull + el nombre queda como snapshot en la
 * fila): se pierde la cadencia, no la plata.
 *
 * ⚠ GATE `guardCobranzaAccess` (ADMIN + SUPER_ADMIN), NO el de costos.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { updatePartner, deletePartner, CobranzaError } from "@/lib/cobranza/mutations";
import { partnerPatchSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ partnerId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { partnerId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = partnerPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    await updatePartner(partnerId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/aliados] error al editar (detalle omitido a propósito)");
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { partnerId } = await params;

  try {
    await deletePartner(partnerId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/aliados] error al borrar (detalle omitido a propósito)");
    throw e;
  }
}
