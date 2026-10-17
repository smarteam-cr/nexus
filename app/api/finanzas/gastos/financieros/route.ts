/**
 * /api/finanzas/gastos/financieros — las comisiones de Stripe, de las transferencias internacionales y del banco, revisadas
 * movimiento por movimiento (plan «Un solo libro financiero», paso 4, 2026-10-17).
 *   GET  → los candidatos de la copia de Mercury que esperan una decisión y los ya decididos, de los últimos doce meses.
 *   POST { movimientoId, decision: "GASTO" | "NO_ES", monto?, nota? } → guarda la decisión, firmada por quien la toma.
 *
 * ⚠ PRIVACIDAD: `guardGastosAccess`/`guardGastosEditor` como PRIMERA línea (costos-privacy.test.ts, P5). Nada de esto lee
 * un salario. ⛔ No toca Mercury: guarda solo la decisión.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardGastosAccess, guardGastosEditor } from "@/lib/auth/api-guards";
import { cargarRevisionFinanciera, decidirGastoFinanciero, GastoFinancieroError } from "@/lib/finanzas/gastos-financieros-server";
import { leerCuerpo } from "@/lib/finanzas/rutas";
import { crDateParts } from "@/lib/jobs/time";

export const dynamic = "force-dynamic";

const decisionSchema = z.object({
  movimientoId: z.string().min(1).max(40),
  decision: z.enum(["GASTO", "NO_ES"]),
  monto: z.number().positive().max(1_000_000).nullable().optional(),
  nota: z.string().trim().max(500).nullable().optional(),
});

export async function GET() {
  const guard = await guardGastosAccess();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await cargarRevisionFinanciera(crDateParts(new Date()).dateKey));
}

export async function POST(req: NextRequest) {
  const guard = await guardGastosEditor();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, decisionSchema);
  if (data instanceof NextResponse) return data;
  try {
    await decidirGastoFinanciero(
      { movimientoId: data.movimientoId, decision: data.decision, monto: data.monto ?? null, nota: data.nota ?? null },
      guard.user.email,
      crDateParts(new Date()).dateKey,
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    if (e instanceof GastoFinancieroError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[finanzas/gastos/financieros] error (detalle omitido a propósito)");
    throw e;
  }
}
