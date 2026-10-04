/**
 * /api/finanzas/tarjetas/[tarjetaId]/saldo — anotar el saldo de una tarjeta a su corte (rediseño de Finanzas, 2026-10-03).
 * ⚠ PRIVACIDAD: `guardGastosEditor` como PRIMERA línea (costos-privacy.test.ts, P5).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardGastosEditor } from "@/lib/auth/api-guards";
import { registrarSaldoTarjeta } from "@/lib/cobranza/mutations";
import { tarjetaSaldoSchema } from "@/lib/cobranza/schema";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

type Params = { params: Promise<{ tarjetaId: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await guardGastosEditor();
  if (guard instanceof NextResponse) return guard;
  const { tarjetaId } = await params;
  const data = await leerCuerpo(req, tarjetaSaldoSchema);
  if (data instanceof NextResponse) return data;
  try {
    await registrarSaldoTarjeta(tarjetaId, data, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "tarjetas-saldo");
  }
}
