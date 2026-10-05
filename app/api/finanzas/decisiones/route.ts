/**
 * /api/finanzas/decisiones — las decisiones de dirección del punto de equilibrio (2026-10-05).
 *   POST { clave: "aliados-cubren-piso", valor: "SI" | "NO", nota? } → la guarda, firmada por quien la toma.
 * Solo dirección (Super Admin): es la misma barrera que el reporte, que mezcla ingresos con planilla.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardSupervisionFinanzas } from "@/lib/auth/api-guards";
import { CLAVE_ALIADOS, guardarDecisionAliados } from "@/lib/finanzas/decisiones-server";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

const decisionSchema = z.object({
  clave: z.literal(CLAVE_ALIADOS),
  valor: z.enum(["SI", "NO"]),
  nota: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const guard = await guardSupervisionFinanzas();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, decisionSchema);
  if (data instanceof NextResponse) return data;
  try {
    await guardarDecisionAliados(data.valor === "SI", guard.user.email, data.nota ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "decisiones");
  }
}
