/**
 * /api/finanzas/recurrentes/[costoId] — editar o borrar un recurrente que NO es salario (rediseño de Finanzas, 2026-10-03).
 *
 * ⚠ PRIVACIDAD: `guardGastosEditor` como PRIMERA línea, y antes de tocar nada `asegurarCostoSinSalario`: un salario
 * contesta 404, como si no existiera. El cambio no puede volverlo salario (el esquema lo rechaza). costos-privacy.test.ts, P5.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardGastosEditor } from "@/lib/auth/api-guards";
import { deleteCosto, updateCosto } from "@/lib/cobranza/mutations";
import { asegurarCostoSinSalario } from "@/lib/finanzas/gastos-server";
import { recurrentePatchSchema } from "@/lib/finanzas/gastos-esquemas";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

type Params = { params: Promise<{ costoId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardGastosEditor();
  if (guard instanceof NextResponse) return guard;
  const { costoId } = await params;
  const data = await leerCuerpo(req, recurrentePatchSchema);
  if (data instanceof NextResponse) return data;
  try {
    await asegurarCostoSinSalario(costoId);
    await updateCosto(costoId, data, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "recurrentes");
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardGastosEditor();
  if (guard instanceof NextResponse) return guard;
  const { costoId } = await params;
  try {
    await asegurarCostoSinSalario(costoId);
    await deleteCosto(costoId, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "recurrentes");
  }
}
