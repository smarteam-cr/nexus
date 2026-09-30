/**
 * /api/cobranza/odoo/facturacion — lo facturado y lo cobrado de cada cliente en un año, de la copia de Odoo.
 *   GET ?anio=2025 → una fila por cliente, la de factura más reciente arriba, con las ventas cerradas en HubSpot ese
 *                    año al lado. Sin `anio`, el año anterior: el último completo. NO consulta el ERP.
 *
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN), el de LECTURA: solo lee. ⚠ Las ventas cerradas son del área de
 * Ventas: viajan solo si quien mira también tiene `ventas.read`; si no, ni se leen.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { can } from "@/lib/auth/permissions/engine";
import { cargarFacturacionPorCliente } from "@/lib/cobranza/odoo/servicio";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;

  const texto = req.nextUrl.searchParams.get("anio");
  const anio = texto === null ? null : Number(texto);
  if (anio !== null && (!Number.isInteger(anio) || anio < 2000 || anio > 2100)) {
    return NextResponse.json({ error: "El año tiene que ser un número, como 2025." }, { status: 400 });
  }
  const conVentas = await can(guard.teamMember, "ventas", "read");
  return NextResponse.json(await cargarFacturacionPorCliente({ anio, conVentas }));
}
