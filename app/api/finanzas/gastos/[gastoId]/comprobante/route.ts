/**
 * /api/finanzas/gastos/[gastoId]/comprobante — «Ya tengo la factura» (2026-11-13).
 *   PUT { comprobante } → anota el número de la factura o el enlace al archivo, con quién y cuándo. null = la quita.
 * Se puede con el mes cerrado: la factura llega después y no cambia ningún monto.
 *
 * ⚠ PRIVACIDAD: `guardGastosEditor` como PRIMERA línea (costos-privacy.test.ts, P5).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardGastosEditor } from "@/lib/auth/api-guards";
import { comprobanteSchema } from "@/lib/finanzas/gastos-esquemas";
import { anotarComprobante } from "@/lib/finanzas/gastos-reglas-server";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

type Params = { params: Promise<{ gastoId: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await guardGastosEditor();
  if (guard instanceof NextResponse) return guard;
  const { gastoId } = await params;
  const data = await leerCuerpo(req, comprobanteSchema);
  if (data instanceof NextResponse) return data;
  try {
    await anotarComprobante(gastoId, data.comprobante, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "gastos");
  }
}
