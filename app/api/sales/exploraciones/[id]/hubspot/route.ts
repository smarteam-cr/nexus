/**
 * POST /api/sales/exploraciones/[id]/hubspot
 *   Mira las reuniones de HubSpot de la preventa (lib/exploraciones/reuniones-de-hubspot.ts): suma las
 *   que ya se hicieron a sus reuniones y, si hay una reciente sin leer, el agente la lee solo, como una
 *   de Meet. Lo pide el lienzo al abrirse; como mucho una vez cada media hora por preventa. Solo lee
 *   HubSpot. Pide poder ver la preventa.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { mirarReunionesDeHubspot } from "@/lib/exploraciones/reuniones-de-hubspot";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await mirarReunionesDeHubspot(id));
}
