/**
 * /api/finanzas/gastos/financieros/[id] — deshacer la decisión sobre un gasto financiero (2026-10-17).
 *   DELETE → borra la decisión: el movimiento vuelve a la lista para revisarlo otra vez. No toca Mercury.
 *
 * ⚠ PRIVACIDAD: `guardGastosEditor` como PRIMERA línea (costos-privacy.test.ts, P5).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardGastosEditor } from "@/lib/auth/api-guards";
import { deshacerGastoFinanciero, GastoFinancieroError } from "@/lib/finanzas/gastos-financieros-server";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardGastosEditor();
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  try {
    await deshacerGastoFinanciero(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof GastoFinancieroError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
