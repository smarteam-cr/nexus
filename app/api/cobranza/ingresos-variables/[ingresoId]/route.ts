/**
 * /api/cobranza/ingresos-variables/[ingresoId] — edición y borrado.
 *   PATCH  → ingresoVariablePatchSchema (parcial).
 *   DELETE → borrado duro (si la plata no entró, la fila no debería existir).
 * ⚠ Solo alcanza a las filas REGISTRADAS acá. Los ingresos DERIVADOS de un
 * `Cobro` (manuales/rescates) se editan en Cobranza — su id no es de esta tabla
 * y el update devuelve 404, que es el comportamiento correcto.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import {
  updateIngresoVariable,
  deleteIngresoVariable,
  CobranzaError,
} from "@/lib/cobranza/mutations";
import { ingresoVariablePatchSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ ingresoId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { ingresoId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = ingresoVariablePatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    await updateIngresoVariable(ingresoId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { ingresoId } = await params;

  try {
    await deleteIngresoVariable(ingresoId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
