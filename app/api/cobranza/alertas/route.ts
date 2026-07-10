/**
 * /api/cobranza/alertas — feed de alertas de cartera.
 *   GET ?estados=ABIERTA,VISTA&urgencia=&cuentaId= → alertas filtradas (max 200).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { loadAlertas } from "@/lib/cobranza/queries";

export async function GET(req: NextRequest) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;

  const sp = req.nextUrl.searchParams;
  const estados = sp.get("estados")?.split(",").filter(Boolean);
  const alertas = await loadAlertas({
    estados: estados?.length ? estados : undefined,
    urgencia: sp.get("urgencia") ?? undefined,
    cuentaId: sp.get("cuentaId") ?? undefined,
  });
  return NextResponse.json({ alertas });
}
