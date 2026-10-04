/**
 * /api/finanzas/cierre/tipo-cambio — el tipo de cambio de un mes, desde el cierre (rediseño de Finanzas, 2026-10-03).
 *   POST { periodo }                      → confirma el que está: queda a nombre de quien confirma.
 *   POST { periodo, crcPorUsd, fuente }   → pone otro, con de dónde sale.
 * Quien lo confirma o lo pone sale del guard: un tipo de cambio firmado por una persona es lo que el cierre pide.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSupervisionFinanzas } from "@/lib/auth/api-guards";
import { guardarTipoCambio } from "@/lib/finanzas/cierre-server";
import { tipoCambioSchema } from "@/lib/finanzas/cierre-esquemas";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

export async function POST(req: NextRequest) {
  const guard = await guardSupervisionFinanzas();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, tipoCambioSchema);
  if (data instanceof NextResponse) return data;
  try {
    await guardarTipoCambio(
      data.periodo,
      guard.user.email,
      data.crcPorUsd !== undefined ? { crcPorUsd: data.crcPorUsd, fuente: data.fuente ?? "" } : null,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "tipo-cambio");
  }
}
