/**
 * /api/cobranza/comisiones-partner/[comisionId] — editar y borrar.
 * ⚠ GATE `guardCobranzaAccess` (ADMIN + SUPER_ADMIN): es un INGRESO.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import {
  updateComisionPartner,
  deleteComisionPartner,
  CobranzaError,
} from "@/lib/cobranza/mutations";
import { comisionPartnerPatchSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ comisionId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { comisionId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = comisionPartnerPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    await updateComisionPartner(comisionId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/comisiones-partner] error al editar");
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { comisionId } = await params;

  try {
    await deleteComisionPartner(comisionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/comisiones-partner] error al borrar");
    throw e;
  }
}
