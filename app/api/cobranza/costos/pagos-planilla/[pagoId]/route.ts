/**
 * /api/cobranza/costos/pagos-planilla/[pagoId] — editar y borrar una quincena.
 *   PATCH  → corregir monto o notas. Solo mientras está PENDIENTE.
 *   DELETE → borrar una quincena generada de más. Solo PENDIENTE.
 *
 * Una quincena PAGADA es INTOCABLE por las dos vías (409 en la mutación): es
 * historia de plata que ya salió, y reescribirla no tendría cómo auditarse.
 * Pagar tiene su propia ruta — es el chokepoint de INV18.
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) PRIMERA línea de cada handler.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { updatePagoPlanilla, deletePagoPlanilla, CobranzaError } from "@/lib/cobranza/mutations";
import { pagoPlanillaPatchSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ pagoId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const { pagoId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = pagoPlanillaPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    await updatePagoPlanilla(pagoId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/planilla] error al editar (detalle omitido a propósito)");
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const { pagoId } = await params;

  try {
    await deletePagoPlanilla(pagoId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/planilla] error al borrar (detalle omitido a propósito)");
    throw e;
  }
}
