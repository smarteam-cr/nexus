/**
 * /api/cobranza/costos/tarjetas/[tarjetaId]/costos — asignar o quitar un costo
 * recurrente de la tarjeta (la tabla puente `TarjetaCreditoCosto`).
 *   POST → tarjetaCostoSchema `{ costoId, asignar }`. Idempotente en los dos
 *          sentidos: re-asignar lo asignado y quitar lo que no está son no-ops.
 *
 * Lo que esto alimenta es la REFERENCIA (cuánto se le carga por mes), nunca el
 * saldo. Ver la doctrina en lib/cobranza/tarjetas.ts.
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) PRIMERA línea del handler.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { asignarCostoATarjeta, CobranzaError } from "@/lib/cobranza/mutations";
import { tarjetaCostoSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ tarjetaId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const { tarjetaId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = tarjetaCostoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    await asignarCostoATarjeta(tarjetaId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/tarjetas] error al asignar costo (detalle omitido a propósito)");
    throw e;
  }
}
