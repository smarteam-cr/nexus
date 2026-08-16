/**
 * /api/cobranza/costos/tarjetas/[tarjetaId]/saldo — registrar el saldo usado.
 *   PUT → tarjetaSaldoSchema (saldo + fecha de corte, los DOS obligatorios).
 *
 * Ruta propia y no un campo del PATCH a propósito: el saldo es la ÚNICA verdad
 * del disponible, exige la fecha a la que corresponde y deja autoría
 * (`saldoPorEmail`, que sale del guard y NUNCA del body). Mezclarlo con la
 * edición de datos permitiría moverlo sin fecha y sin firma.
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) PRIMERA línea del handler.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { registrarSaldoTarjeta, CobranzaError } from "@/lib/cobranza/mutations";
import { tarjetaSaldoSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ tarjetaId: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const { tarjetaId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = tarjetaSaldoSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    await registrarSaldoTarjeta(tarjetaId, parsed.data, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[cobranza/tarjetas] error al registrar saldo (detalle omitido a propósito)");
    throw e;
  }
}
