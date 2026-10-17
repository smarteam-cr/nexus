/**
 * /api/cobranza/licencias — los contratos que revenden licencias, con su parte de servicio y su costo (plan «Un solo libro
 * financiero», etapa «Servicio y licencia», 2026-10-17).
 *   GET  → los contratos vivos y las cuentas de cobro para elegir.
 *   POST → carga un contrato, firmado por quien lo carga (201).
 *
 * Acceso: GET con guardCobranzaAccess; POST con guardCobranzaEditor (`cobranza.write`): cambia el punto de equilibrio.
 * Las reglas de lo que se puede guardar: lib/finanzas/licencias.ts (`problemasDeLicencia`), repetidas en los CHECK del SQL.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess, guardCobranzaEditor } from "@/lib/auth/api-guards";
import { cargarLicencias } from "@/lib/finanzas/licencias-server";
import { crearLicencia, cuentasParaLicencias } from "@/lib/finanzas/licencias-escritura-server";
import { licenciaSchema } from "@/lib/finanzas/licencias-esquema";
import { leerCuerpo, responderError } from "@/lib/finanzas/rutas";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const [contratos, cuentas] = await Promise.all([cargarLicencias(), cuentasParaLicencias()]);
  return NextResponse.json({ contratos, cuentas });
}

export async function POST(req: NextRequest) {
  const guard = await guardCobranzaEditor();
  if (guard instanceof NextResponse) return guard;
  const data = await leerCuerpo(req, licenciaSchema);
  if (data instanceof NextResponse) return data;
  try {
    return NextResponse.json({ id: await crearLicencia(data, guard.user.email) }, { status: 201 });
  } catch (e) {
    return responderError(e, "licencias");
  }
}
