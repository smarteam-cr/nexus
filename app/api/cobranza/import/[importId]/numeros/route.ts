/**
 * GET /api/cobranza/import/[importId]/numeros — el número de factura propuesto para cada cuota, desde el
 * libro de Alex (etapa 11, lib/cobranza/odoo/numero-propuesta.ts).
 *
 * Solo lectura. Guardar un número es «Es esta» en la pantalla, que va por el PATCH del cobro: pide editor
 * y firma con el email de quien confirma (lib/cobranza/numero-factura.ts). Esta ruta no escribe nada.
 *
 * Acceso: guardCobranzaAccess, el mismo que abrir el importador.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { LibroError, numerosDelLote } from "@/lib/cobranza/libro-alex-server";
import { crDateParts } from "@/lib/jobs/time";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ importId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { importId } = await params;

  try {
    const respuesta = await numerosDelLote(importId, crDateParts(new Date()).dateKey);
    if (!respuesta) return NextResponse.json({ error: "Ese lote no existe." }, { status: 404 });
    return NextResponse.json(respuesta);
  } catch (e) {
    if (e instanceof LibroError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
