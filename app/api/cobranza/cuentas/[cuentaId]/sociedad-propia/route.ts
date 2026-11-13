/**
 * /api/cobranza/cuentas/[cuentaId]/sociedad-propia — qué sociedad de Smarteam le cobra a la cuenta (2026-11-13).
 *   GET → las sociedades, la puesta, la de su vía y la que vale.
 *   PUT { sociedadId } → elegirla (la de su vía se guarda como «ninguna»: la cuenta vuelve a seguir su vía).
 *
 * Leer: guardCobranzaAccess. Escribir: guardCobranzaEditor, que firma la línea de la bitácora.
 * ⚠ No es la sociedad del cliente a la que se factura (eso es /sociedades).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess, guardCobranzaEditor } from "@/lib/auth/api-guards";
import { CobranzaError } from "@/lib/cobranza/mutations";
import { leerSociedadDeLaCuenta, ponerSociedadALaCuenta } from "@/lib/sociedades/server";
import { sociedadDeLaCuentaSchema } from "@/lib/sociedades/schema";
import { leerCuerpo } from "@/lib/finanzas/rutas";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ cuentaId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { cuentaId } = await params;
  try {
    return NextResponse.json(await leerSociedadDeLaCuenta(cuentaId));
  } catch (e) {
    if (e instanceof CobranzaError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaEditor();
  if (guard instanceof NextResponse) return guard;
  const { cuentaId } = await params;
  const data = await leerCuerpo(req, sociedadDeLaCuentaSchema);
  if (data instanceof NextResponse) return data;
  try {
    await ponerSociedadALaCuenta(cuentaId, data.sociedadId, guard.user.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
