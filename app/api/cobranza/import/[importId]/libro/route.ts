/**
 * GET /api/cobranza/import/[importId]/libro — el libro de Alex contra Nexus, fila por fila (etapa 11).
 *
 * Solo lectura: compara el lote guardado con lo que Nexus tiene HOY (cuentas, cobros, espejo de Odoo) y
 * devuelve una propuesta por documento (lib/cobranza/libro-alex.ts). No escribe nada y no llama al ERP.
 * Se compara de nuevo cada vez que se abre: si Alex anota un número o saca un cobro de Cobrado, la fila
 * cambia sola.
 *
 * Acceso: guardCobranzaAccess, el mismo que abrir el importador.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { LibroError, compararLote } from "@/lib/cobranza/libro-alex-server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ importId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { importId } = await params;

  try {
    const respuesta = await compararLote(importId);
    if (!respuesta) return NextResponse.json({ error: "Ese lote no existe." }, { status: 404 });
    return NextResponse.json(respuesta);
  } catch (e) {
    if (e instanceof LibroError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
