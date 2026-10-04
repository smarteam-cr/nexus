/**
 * /api/finanzas/gastos/listos — «Ya anoté todos los gastos de <mes>» y su vuelta atrás (rediseño de Finanzas, 2026-10-03).
 *   POST { periodo, listos } → lo anota en el cierre del mes, con quién y cuándo. Un mes cerrado no se toca (409).
 * ⚠ PRIVACIDAD: `guardGastosEditor` como PRIMERA línea (costos-privacy.test.ts, P5).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardGastosEditor } from "@/lib/auth/api-guards";
import { marcarGastosListos } from "@/lib/finanzas/gastos-server";
import { gastosListosSchema } from "@/lib/finanzas/gastos-esquemas";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

export async function POST(req: NextRequest) {
  const guard = await guardGastosEditor();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, gastosListosSchema);
  if (data instanceof NextResponse) return data;
  try {
    await marcarGastosListos(data.periodo, data.listos, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "gastos-listos");
  }
}
