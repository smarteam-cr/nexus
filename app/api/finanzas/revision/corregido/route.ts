/**
 * /api/finanzas/revision/corregido — «Ya lo corregí», de quien registró algo que le devolvieron (rediseño de Finanzas,
 * 2026-10-03). POST { tipo, id } → vuelve a la revisión marcado como corregido.
 * Permiso: editar lo que corrigió — Cobranza para un pago, gastos para un gasto — Y ser quien lo registró o quien
 * supervisa Finanzas (2026-10-05; lo decide `marcarCorregido`, 403 con el nombre de quien lo registró). «Supervisa» es
 * la condición de `guardSupervisionFinanzas`: `isCostosRole` sobre el rol del mismo guard. Quién lo corrigió sale del
 * guard.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { can } from "@/lib/auth/permissions/engine";
import { marcarCorregido } from "@/lib/finanzas/revision-server";
import { itemRevisadoSchema } from "@/lib/finanzas/revision-esquemas";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, itemRevisadoSchema);
  if (data instanceof NextResponse) return data;
  if (!(await can(guard.teamMember, data.tipo === "PAGO" ? "cobranza" : "gastos", "write"))) {
    return NextResponse.json({ error: "Tu rol no puede corregir esto." }, { status: 403 });
  }
  try {
    await marcarCorregido(data, { email: guard.user.email, supervisa: isCostosRole(guard.role) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "revision-corregido");
  }
}
