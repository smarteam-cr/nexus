/**
 * GET /api/business-cases/preventas?clientId=…
 *
 * Las preventas vivas de una empresa que ya está en Nexus, para ofrecerlas al crear una propuesta
 * («CreditForce pasó por Preventa · Usarla como contexto»). Sin preventas, la lista va vacía y la
 * propuesta se arma igual. Pide `ventas.read`. Solo lee.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardSalesAccess } from "@/lib/auth/api-guards";
import { preventasDeLaEmpresa } from "@/lib/exploraciones/en-las-propuestas";

export async function GET(req: NextRequest) {
  const guard = await guardSalesAccess();
  if (guard instanceof NextResponse) return guard;

  const clientId = req.nextUrl.searchParams.get("clientId")?.trim() ?? "";
  if (!clientId) return NextResponse.json({ preventas: [] });
  return NextResponse.json({ preventas: await preventasDeLaEmpresa(clientId) });
}
