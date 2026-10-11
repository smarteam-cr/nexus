/**
 * /api/clients/[id]/solicitudes-fuera-de-alcance/[solicitudId] — el seguimiento de una solicitud:
 * PATCH { estado?, nota?, pedido?, monto?, quienLoPidio?, projectId? }. Al confirmarla, avisa a la líder
 * de Customer Success y al vendedor (lib/sessions/solicitudes-server.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { leerCambio } from "@/lib/sessions/solicitudes-fuera-de-alcance";
import { cambiarSolicitud, ProyectoDeOtroCliente, SolicitudNoEncontrada } from "@/lib/sessions/solicitudes-server";

type Params = Promise<{ id: string; solicitudId: string }>;

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { id, solicitudId } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const cambio = leerCambio(await req.json().catch(() => null));
  if (!cambio) return NextResponse.json({ error: "No hay nada que cambiar." }, { status: 400 });
  try {
    return NextResponse.json(await cambiarSolicitud({ clientId: id, id: solicitudId, cambio, actorEmail: guard.user.email }));
  } catch (e) {
    if (e instanceof SolicitudNoEncontrada) return NextResponse.json({ error: e.message }, { status: 404 });
    if (e instanceof ProyectoDeOtroCliente) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
