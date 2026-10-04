/**
 * /api/finanzas/gastos — los gastos del mes, sin salarios (rediseño de Finanzas, 2026-10-03).
 *   GET  ?mes=YYYY-MM → GastosDelMesDTO: los gastos puntuales del mes, los recurrentes que no son salarios, el TOTAL de la
 *        planilla del mes y si ya se avisó que están todos.
 *   POST → anota un gasto puntual, firmado por quien lo anota (201).
 *
 * ⚠ PRIVACIDAD: `guardGastosAccess`/`guardGastosEditor` como PRIMERA línea. Nada de esto lee un salario
 * (lib/finanzas/gastos-server.ts). Lo vigila costos-privacy.test.ts (P5).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardGastosAccess, guardGastosEditor } from "@/lib/auth/api-guards";
import { createGasto } from "@/lib/cobranza/mutations";
import { gastoCreateSchema } from "@/lib/cobranza/schema";
import { loadGastosDelMes } from "@/lib/finanzas/gastos-server";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";
import { crDateParts } from "@/lib/jobs/time";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await guardGastosAccess();
  if (guard instanceof NextResponse) return guard;
  const mes = req.nextUrl.searchParams.get("mes");
  const periodo = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : crDateParts(new Date()).dateKey.slice(0, 7);
  return NextResponse.json(await loadGastosDelMes(periodo));
}

export async function POST(req: NextRequest) {
  const guard = await guardGastosEditor();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, gastoCreateSchema);
  if (data instanceof NextResponse) return data;
  try {
    return NextResponse.json({ gasto: await createGasto(data, guard.user.email) }, { status: 201 });
  } catch (e) {
    return responderError(e, "gastos");
  }
}
