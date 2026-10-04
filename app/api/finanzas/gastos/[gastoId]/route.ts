/**
 * /api/finanzas/gastos/[gastoId] — editar o borrar un gasto puntual (rediseño de Finanzas, 2026-10-03).
 * ⚠ PRIVACIDAD: `guardGastosEditor` como PRIMERA línea (costos-privacy.test.ts, P5). Un gasto puntual no es un salario.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardGastosEditor } from "@/lib/auth/api-guards";
import { deleteGasto, updateGasto } from "@/lib/cobranza/mutations";
import { gastoPatchSchema } from "@/lib/cobranza/schema";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

type Params = { params: Promise<{ gastoId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardGastosEditor();
  if (guard instanceof NextResponse) return guard;
  const { gastoId } = await params;
  const data = await leerCuerpo(req, gastoPatchSchema);
  if (data instanceof NextResponse) return data;
  try {
    await updateGasto(gastoId, data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "gastos");
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardGastosEditor();
  if (guard instanceof NextResponse) return guard;
  const { gastoId } = await params;
  try {
    await deleteGasto(gastoId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "gastos");
  }
}
