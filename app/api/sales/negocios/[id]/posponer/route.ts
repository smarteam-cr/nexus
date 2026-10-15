/**
 * POST /api/sales/negocios/[id]/posponer — «Ahora no» a la pregunta de la fecha de cierre y el monto: no se vuelve a
 * preguntar en 7 días. No toca HubSpot. Pide `ventas.read` y ser el dueño del negocio o tener `ventas.write`.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPermission } from "@/lib/auth/api-guards";
import { ErrorDelNegocio, posponerPregunta } from "@/lib/ventas/negocio-escritura-server";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const guard = await guardPermission("ventas", "read");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  try {
    const n = await posponerPregunta(id, guard.teamMember);
    olvidarMedicion(guard.teamMember.email);
    return NextResponse.json({ ok: true, hasta: n.preguntaPospuestaHasta?.toISOString() ?? null });
  } catch (e) {
    if (e instanceof ErrorDelNegocio) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
