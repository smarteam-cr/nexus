/**
 * /api/cobranza/gastos/[gastoId] — edición y borrado de un gasto puntual.
 *   PATCH  → gastoPatchSchema (parcial; tags re-normalizados).
 *   DELETE → borrado duro (un gasto es un hecho; si no ocurrió, se borra).
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) como PRIMERA línea de cada
 * handler — corta ANTES de tocar la DB (403, nunca 404 para un no-autorizado).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { updateGasto, deleteGasto, CobranzaError } from "@/lib/cobranza/mutations";
import { gastoPatchSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ gastoId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const { gastoId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = gastoPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    await updateGasto(gastoId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/gastos] error al editar (detalle omitido a propósito)");
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const { gastoId } = await params;

  try {
    await deleteGasto(gastoId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/gastos] error al borrar (detalle omitido a propósito)");
    throw e;
  }
}
