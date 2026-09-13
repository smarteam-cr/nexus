/**
 * GET /api/cobranza/cobros/[cobroId]/facturas-candidatas — los documentos del espejo de Odoo que se
 * pueden elegir al marcar facturado este cobro (etapa 7, 2026-09-12).
 *
 * Solo lectura: no escribe nada y no llama al ERP (sale del espejo). Acceso: guardCobranzaAccess, el
 * mismo que abrir el cronograma. Guardar el número pasa por el PATCH del cobro, que pide editor y
 * es el que firma (lib/cobranza/numero-factura.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { candidatasParaCobro } from "@/lib/cobranza/odoo/servicio";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ cobroId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { cobroId } = await params;

  const datos = await candidatasParaCobro(cobroId);
  if (!datos) return NextResponse.json({ error: "El cobro no existe." }, { status: 404 });
  return NextResponse.json(datos);
}
