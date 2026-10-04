/**
 * /api/finanzas/recurrentes — los costos recurrentes que NO son salarios (rediseño de Finanzas, 2026-10-03).
 *   GET  → { costos: CostoRecurrenteDTO[] } solo herramientas y fijos de operación (el filtro va en la consulta).
 *   POST → crea uno; la categoría tiene que ser herramienta o fijo de operación, sin persona ni cargas.
 *
 * ⚠ PRIVACIDAD: `guardGastosAccess`/`guardGastosEditor` como PRIMERA línea; los salarios siguen en /api/cobranza/costos,
 * solo para Super Admin. Lo vigila costos-privacy.test.ts (P5).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardGastosAccess, guardGastosEditor } from "@/lib/auth/api-guards";
import { loadCostos } from "@/lib/cobranza/queries";
import { createCosto } from "@/lib/cobranza/mutations";
import { recurrenteCreateSchema } from "@/lib/finanzas/gastos-esquemas";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await guardGastosAccess();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ costos: await loadCostos({ sinSalarios: true }) });
}

export async function POST(req: NextRequest) {
  const guard = await guardGastosEditor();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, recurrenteCreateSchema);
  if (data instanceof NextResponse) return data;
  try {
    return NextResponse.json({ costo: await createCosto(data, guard.user.email) }, { status: 201 });
  } catch (e) {
    return responderError(e, "recurrentes");
  }
}
