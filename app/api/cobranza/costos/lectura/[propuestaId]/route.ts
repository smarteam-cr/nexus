/**
 * /api/cobranza/costos/lectura/[propuestaId] — usar o desestimar una propuesta de la lectura de los números.
 *   PATCH { decision: "usado" | "desestimado", motivo? } → firmada por quien decide. Desestimar pide el motivo.
 *
 * ⚠ PRIVACIDAD: guardCostosAccess (SOLO SUPER_ADMIN) PRIMERA línea del handler.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { decidirPropuesta } from "@/lib/rentabilidad/lectura/servidor";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

const decisionSchema = z.object({
  decision: z.enum(["usado", "desestimado"]),
  motivo: z.string().trim().max(1000).nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ propuestaId: string }> }) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const { propuestaId } = await params;
  const data = await leerCuerpo(req, decisionSchema);
  if (data instanceof NextResponse) return data;
  try {
    await decidirPropuesta(propuestaId, data.decision, data.motivo ?? null, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "lectura");
  }
}
