/**
 * POST /api/sessions/[id]/correo — arma con el agente el correo de seguimiento de una reunión con un cliente (ficha G,
 * 2026-10-17): lo que entendimos, lo acordado, los próximos pasos y la próxima reunión. Es el mismo correo de las
 * exploraciones (lib/seguimiento/reunion/correo-server.ts). Además deja sugerida la próxima reunión. Lo revisa y lo manda
 * una persona: Nexus no envía nada. Gasta IA y es síncrono: tarda unos segundos.
 *
 * Pide un usuario interno con acceso al cliente dueño de la reunión (`guardAccesoALaReunion`: sin acceso, 404). Sin
 * dueño, de un aliado, de Smarteam o de puertas adentro: 409.
 */
import { NextRequest, NextResponse } from "next/server";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { guardAccesoALaReunion } from "@/lib/sessions/acceso-a-la-reunion";
import { armarCorreoDeLaReunion } from "@/lib/seguimiento/reunion/correo-server";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const acceso = await guardAccesoALaReunion(id);
  if (acceso instanceof NextResponse) return acceso;
  if (!acceso.dueno) return NextResponse.json({ error: "Esta reunión no tiene cliente: no lleva correo de seguimiento." }, { status: 409 });
  try {
    const r = await armarCorreoDeLaReunion({ sessionId: id, dueno: acceso.dueno, email: acceso.user.email });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ correo: r.correo });
  } catch (e) {
    if (esquemaDesactualizado(e)) {
      return NextResponse.json({ error: "A la base le falta el SQL de la página de la reunión. Corre npm run check:esquema." }, { status: 503 });
    }
    throw e;
  }
}
