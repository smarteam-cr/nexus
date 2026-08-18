/**
 * /api/cobranza/costos/pagos-planilla/[pagoId]/pagar — el CHOKEPOINT del libro.
 *   PUT → marca la quincena PAGADA con `confirmadoPor` del guard (INV18, espejo
 *         de INV3 en Cobro: ningún PAGADO sin quién lo confirmó).
 *
 * Ruta propia y no un campo del PATCH a propósito: pagar es la acción con
 * consecuencia monetaria y tiene que embudarse en UN solo lugar auditable. El
 * PATCH genérico ni siquiera acepta `estado`.
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) PRIMERA línea del handler.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { pagarQuincena, CobranzaError } from "@/lib/cobranza/mutations";
import { planillaPagarSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ pagoId: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const { pagoId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = planillaPagarSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    await pagarQuincena(pagoId, parsed.data, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/planilla] error al pagar (detalle omitido a propósito)");
    throw e;
  }
}
