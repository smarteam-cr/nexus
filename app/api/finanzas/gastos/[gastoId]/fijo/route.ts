/**
 * /api/finanzas/gastos/[gastoId]/fijo — «Este gasto se repite» (2026-11-13): el gasto puntual (variable) se vuelve un
 * fijo, que se proyecta solo desde el mes que sigue al del gasto. El gasto se queda en su mes, atado al fijo.
 *   POST { categoria, frecuencia, presupuesto? } → { costoId, desde } (201). 409 si ya es un fijo.
 *
 * ⚠ PRIVACIDAD: `guardGastosEditor` como PRIMERA línea (costos-privacy.test.ts, P5). El fijo nace herramienta o fijo de
 * operación: el esquema no acepta otra categoría.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardGastosEditor } from "@/lib/auth/api-guards";
import { volverFijoSchema } from "@/lib/finanzas/gastos-esquemas";
import { volverFijo } from "@/lib/finanzas/gastos-reglas-server";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

type Params = { params: Promise<{ gastoId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await guardGastosEditor();
  if (guard instanceof NextResponse) return guard;
  const { gastoId } = await params;
  const data = await leerCuerpo(req, volverFijoSchema);
  if (data instanceof NextResponse) return data;
  try {
    return NextResponse.json(await volverFijo(gastoId, data, guard.user.email), { status: 201 });
  } catch (e) {
    return responderError(e, "gastos");
  }
}
