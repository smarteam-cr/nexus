/**
 * /api/cobranza/costos/[costoId] — edición y borrado de un costo recurrente.
 *   PATCH  → costoPatchSchema (cross-field re-validado en updateCosto sobre la
 *            fila mergeada; salir de SALARIO suelta persona/base/factor).
 *   DELETE → borrado duro (sin historia dependiente); activo=false es la pausa.
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) como PRIMERA línea de cada
 * handler — corta ANTES de tocar la DB (403, nunca 404 para un no-autorizado).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { updateCosto, deleteCosto, CobranzaError } from "@/lib/cobranza/mutations";
import { costoPatchSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ costoId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const { costoId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = costoPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    await updateCosto(costoId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/costos] error al editar (detalle omitido a propósito)");
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const { costoId } = await params;

  try {
    await deleteCosto(costoId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/costos] error al borrar (detalle omitido a propósito)");
    throw e;
  }
}
