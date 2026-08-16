/**
 * /api/cobranza/costos/tarjetas/[tarjetaId] — editar y borrar una tarjeta.
 *   PATCH  → tarjetaPatchSchema. ⚠ NO toca el saldo: eso va por `/saldo`, que
 *            exige fecha de corte y deja autoría. Un PATCH genérico podría
 *            moverlo sin ninguna de las dos y el disponible pasaría a ser un
 *            número sin respaldo.
 *   DELETE → borrado duro. El puente cae por CASCADE: se pierde el vínculo, NO
 *            los costos (que siguen contando en el burn, que es lo correcto).
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) PRIMERA línea de cada handler.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { updateTarjeta, deleteTarjeta, CobranzaError } from "@/lib/cobranza/mutations";
import { tarjetaPatchSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ tarjetaId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const { tarjetaId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = tarjetaPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    await updateTarjeta(tarjetaId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/tarjetas] error al editar (detalle omitido a propósito)");
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const { tarjetaId } = await params;

  try {
    await deleteTarjeta(tarjetaId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/tarjetas] error al borrar (detalle omitido a propósito)");
    throw e;
  }
}
