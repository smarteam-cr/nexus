/**
 * /api/finanzas/decisiones — las decisiones de dirección del punto de equilibrio (2026-10-05).
 *   POST { clave: "aliados-cubren-piso", valor: "SI" | "NO", nota? } → la guarda, firmada por quien la toma.
 *   POST { clave: "licencias-en-equilibrio", valor: "SOLO_SERVICIO" | "INGRESO_Y_COSTO", nota? } → ídem (2026-10-17).
 * Solo dirección (Super Admin): es la misma barrera que el reporte, que mezcla ingresos con planilla.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardSupervisionFinanzas } from "@/lib/auth/api-guards";
import { CLAVE_ALIADOS, CLAVE_LICENCIAS, guardarDecisionAliados, guardarDecisionLicencias } from "@/lib/finanzas/decisiones-server";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

const nota = z.string().trim().max(1000).nullable().optional();
const decisionSchema = z.discriminatedUnion("clave", [
  z.object({ clave: z.literal(CLAVE_ALIADOS), valor: z.enum(["SI", "NO"]), nota }),
  z.object({ clave: z.literal(CLAVE_LICENCIAS), valor: z.enum(["SOLO_SERVICIO", "INGRESO_Y_COSTO"]), nota }),
]);

export async function POST(req: NextRequest) {
  const guard = await guardSupervisionFinanzas();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, decisionSchema);
  if (data instanceof NextResponse) return data;
  try {
    if (data.clave === CLAVE_LICENCIAS) await guardarDecisionLicencias(data.valor, guard.user.email, data.nota ?? null);
    else await guardarDecisionAliados(data.valor === "SI", guard.user.email, data.nota ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "decisiones");
  }
}
