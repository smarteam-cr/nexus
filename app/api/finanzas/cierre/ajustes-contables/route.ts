/**
 * /api/finanzas/cierre/ajustes-contables — la marca «ajustes contables pendientes» de un mes (2026-11-13).
 *   GET  ?mes=YYYY-MM                    → la marca y los indicios de Odoo (leídos en el momento; si Odoo no contesta,
 *                                          la marca igual).
 *   POST { periodo, pendientes, nota? }  → poner o quitar la marca, a nombre de quien la pone.
 * Solo dirección, como el cierre (guardSupervisionFinanzas).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSupervisionFinanzas } from "@/lib/auth/api-guards";
import { leerAjustesDelMes, marcarAjustes } from "@/lib/sociedades/server";
import { marcaDeAjustesSchema } from "@/lib/sociedades/schema";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await guardSupervisionFinanzas();
  if (guard instanceof NextResponse) return guard;
  try {
    return NextResponse.json(await leerAjustesDelMes(req.nextUrl.searchParams.get("mes") ?? "", true));
  } catch (e) {
    return responderError(e, "cierre/ajustes-contables");
  }
}

export async function POST(req: NextRequest) {
  const guard = await guardSupervisionFinanzas();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, marcaDeAjustesSchema);
  if (data instanceof NextResponse) return data;
  try {
    await marcarAjustes(data.periodo, data.pendientes, data.nota ?? null, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return responderError(e, "cierre/ajustes-contables");
  }
}
