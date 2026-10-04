/**
 * /api/finanzas/tarjetas/[tarjetaId]/costos — qué recurrentes se pagan con una tarjeta (rediseño de Finanzas, 2026-10-03).
 *
 * ⚠ PRIVACIDAD: `guardGastosEditor` como PRIMERA línea, y antes de asignar `asegurarCostosSinSalario`: desde acá no se
 * puede asignar (ni confirmar que existe) un salario. costos-privacy.test.ts, P5.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardGastosEditor } from "@/lib/auth/api-guards";
import { asignarCostoATarjeta } from "@/lib/cobranza/mutations";
import { tarjetaCostoSchema } from "@/lib/cobranza/schema";
import { asegurarCostosSinSalario } from "@/lib/finanzas/gastos-server";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

type Params = { params: Promise<{ tarjetaId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await guardGastosEditor();
  if (guard instanceof NextResponse) return guard;
  const { tarjetaId } = await params;
  const data = await leerCuerpo(req, tarjetaCostoSchema);
  if (data instanceof NextResponse) return data;
  try {
    await asegurarCostosSinSalario([data.costoId]);
    await asignarCostoATarjeta(tarjetaId, data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "tarjetas-costos");
  }
}
