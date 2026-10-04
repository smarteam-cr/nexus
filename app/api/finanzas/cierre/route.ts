/**
 * /api/finanzas/cierre — el cierre del mes (rediseño de Finanzas, 2026-10-03, etapa «Cierre del mes»).
 *   GET  ?mes=YYYY-MM                         → el cierre de ese mes y la tira de su año.
 *   POST { accion: CERRAR, periodo }          → cierra (409 si no terminó o si falta algo que bloquea).
 *   POST { accion: REABRIR, periodo, motivo } → lo reabre; el motivo queda escrito.
 * Quien cierra o reabre sale del guard. ⛔ Lee la planilla: solo dirección.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSupervisionFinanzas } from "@/lib/auth/api-guards";
import { crDateParts } from "@/lib/jobs/time";
import { cargarCierre, cerrarMes, reabrirMes } from "@/lib/finanzas/cierre-server";
import { accionDeCierreSchema } from "@/lib/finanzas/cierre-esquemas";
import { mesParaCerrar } from "@/lib/finanzas/cierre";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

export async function GET(req: NextRequest) {
  const guard = await guardSupervisionFinanzas();
  if (guard instanceof NextResponse) return guard;
  const hoyISO = crDateParts(new Date()).dateKey;
  try {
    return NextResponse.json(await cargarCierre(req.nextUrl.searchParams.get("mes") ?? mesParaCerrar(hoyISO), hoyISO, { conEquipo: true }));
  } catch (e) {
    return responderError(e, "cierre");
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardSupervisionFinanzas();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, accionDeCierreSchema);
  if (data instanceof NextResponse) return data;
  try {
    if (data.accion === "CERRAR") await cerrarMes(data.periodo, guard.user.email, crDateParts(new Date()).dateKey);
    else await reabrirMes(data.periodo, data.motivo, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "cierre");
  }
}
