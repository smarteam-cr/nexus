/**
 * /api/cobranza/facturas/detalle — las líneas y la nota de una factura de Odoo o de Mercury (plan «Un solo libro
 * financiero», paso 5, 2026-10-17).
 *   GET ?fuente=ODOO|MERCURY&id=<id de la factura en la copia> → el detalle, leído del sistema en ese momento.
 *
 * Acceso: guardCobranzaAccess (leer). Lo pide una persona al abrir una factura: cada pedido es una consulta al sistema.
 * ⛔ Solo lee Odoo y Mercury. No guarda nada.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { cargarDetalleDeFacturaOdoo } from "@/lib/cobranza/odoo/servicio";
import { cargarDetalleDeFacturaMercury } from "@/lib/cobranza/mercury/servicio";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const fuente = req.nextUrl.searchParams.get("fuente");
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if ((fuente !== "ODOO" && fuente !== "MERCURY") || !/^[a-z0-9]{10,40}$/i.test(id)) {
    return NextResponse.json({ error: "Falta qué factura: fuente ODOO o MERCURY y su id." }, { status: 400 });
  }
  try {
    const detalle = fuente === "ODOO" ? await cargarDetalleDeFacturaOdoo(id) : await cargarDetalleDeFacturaMercury(id);
    if (!detalle) return NextResponse.json({ error: "Esa factura no está en la copia." }, { status: 404 });
    return NextResponse.json(detalle);
  } catch (e) {
    /* Los errores de Odoo y de Mercury vienen redactados para una persona y sin secretos (OdooError, MercuryError). */
    const sistema = fuente === "ODOO" ? "Odoo" : "Mercury";
    console.error(`[cobranza/facturas/detalle] ${sistema} no contestó (detalle omitido a propósito)`);
    return NextResponse.json({ error: `No se pudo leer la factura en ${sistema}: ${e instanceof Error ? e.message : "sin detalle"}` }, { status: 502 });
  }
}
