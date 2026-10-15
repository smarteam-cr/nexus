/**
 * POST /api/sales/negocios/actualizar — trae ya los negocios abiertos de HubSpot (el botón «Actualizar» de la cartera
 * de Ventas en «Para ti»). La misma copia que el job `negocios-abiertos`, con su candado: si hay otra corrida, responde
 * sin hacer nada. Si la última copia es de hace menos de 2 minutos, tampoco vuelve a leer HubSpot. Pide `ventas.read`.
 */
import { NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { syncNegociosAbiertos, ultimaCopiaDeNegocios } from "@/lib/ventas/sync-negocios-abiertos";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";
import { esquemaDesactualizado } from "@/lib/db/esquema";

const RECIEN_MS = 2 * 60_000;

export async function POST() {
  const guard = await guardPermission("ventas", "read");
  if (guard instanceof NextResponse) return guard;
  try {
    const ultima = await ultimaCopiaDeNegocios();
    if (ultima && Date.now() - ultima.getTime() < RECIEN_MS) {
      return NextResponse.json({ ok: true, omitido: "reciente", copiadoAt: ultima.toISOString() });
    }
    const r = await syncNegociosAbiertos();
    olvidarMedicion(guard.teamMember.email);
    if (r.locked) return NextResponse.json({ ok: true, omitido: "en-curso" });
    return NextResponse.json({ ok: true, traidos: r.traidos, parcial: r.parcial ?? false, errores: r.errores.length });
  } catch (e) {
    if (esquemaDesactualizado(e)) {
      return NextResponse.json({ error: "Falta aplicar scripts/sql/2026-10-14-negocios-abiertos.sql." }, { status: 503 });
    }
    return NextResponse.json({ error: `No se pudo leer HubSpot: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
