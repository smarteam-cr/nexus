/**
 * /api/cobranza/costos/comisiones-vendedor/liquidar — congelar lo devengado.
 *   POST   → liquidarComisionSchema. El monto NO viene del body: lo recalcula el
 *            server con el mismo cálculo puro que pintó la pantalla.
 *   DELETE → deshacer una liquidación (`?comisionId=`). Los cobros vuelven a
 *            devengar solos y con eso se suelta el 409 que frena el revert.
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) PRIMERA línea de cada handler.
 * El email de la liquidación sale del guard, nunca del body — es la autoría, y
 * un body que la pudiera escribir la volvería decorativa.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { liquidarComision, deshacerLiquidacion, CobranzaError } from "@/lib/cobranza/mutations";
import { liquidarComisionSchema } from "@/lib/cobranza/schema";

export async function POST(req: NextRequest) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = liquidarComisionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    const comision = await liquidarComision(parsed.data, guard.user.email);
    return NextResponse.json({ comision }, { status: 201 });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/comisiones-vendedor] error al liquidar (detalle omitido a propósito)");
    throw e;
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;

  const comisionId = req.nextUrl.searchParams.get("comisionId");
  if (!comisionId) {
    return NextResponse.json({ error: "Falta comisionId" }, { status: 400 });
  }

  try {
    await deshacerLiquidacion(comisionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/comisiones-vendedor] error al deshacer (detalle omitido a propósito)");
    throw e;
  }
}
