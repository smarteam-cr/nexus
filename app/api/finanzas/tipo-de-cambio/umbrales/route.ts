/**
 * /api/finanzas/tipo-de-cambio/umbrales — los dos topes del aviso de tipo de cambio de la planilla (2026-11-13).
 *   PUT { vigilarPct, decidirPct } → los guarda. Desde «vigilar» el aviso es amarillo; desde «decidir», rojo.
 *
 * SOLO Super Admin (`guardCostosAccess` sin excepción por persona): lo acordado con Elías. Los topes no son plata, pero
 * deciden cuándo se le avisa a dirección.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCostosAccess } from "@/lib/auth/api-guards";
import { errorDeUmbrales } from "@/lib/finanzas/tipo-cambio-planilla";
import { umbralesSchema } from "@/lib/finanzas/tipo-cambio-esquemas";
import { guardarUmbrales } from "@/lib/finanzas/tipo-cambio-planilla-server";
import { leerCuerpo } from "@/lib/finanzas/rutas";

export async function PUT(req: NextRequest) {
  const guard = await guardCostosAccess();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, umbralesSchema);
  if (data instanceof NextResponse) return data;
  const error = errorDeUmbrales(data);
  if (error) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ umbrales: await guardarUmbrales(data, guard.user.email) });
}
