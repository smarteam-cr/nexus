/**
 * /api/clients/[id]/solicitudes-fuera-de-alcance — las solicitudes fuera de alcance de un cliente
 * (2026-10-07; reglas en lib/sessions/solicitudes-fuera-de-alcance.ts).
 *
 *   GET  → todas las del cliente, las que piden decisión primero
 *   POST → el CSE suma una que no salió de una reunión: { pedido, quienLoPidio?, monto?, nota?, projectId? }.
 *          Nace confirmada y avisa a la líder de Customer Success y al vendedor.
 *
 * Interno: nada de esto cruza a un documento del cliente.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { leerAlta } from "@/lib/sessions/solicitudes-fuera-de-alcance";
import {
  ProyectoDeOtroCliente,
  SolicitudRepetida,
  solicitudesDelCliente,
  sumarSolicitud,
} from "@/lib/sessions/solicitudes-server";

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ solicitudes: await solicitudesDelCliente(id) });
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const alta = leerAlta(await req.json().catch(() => null));
  if (!alta) return NextResponse.json({ error: "Escribe qué pidió el cliente." }, { status: 400 });
  try {
    const r = await sumarSolicitud({ clientId: id, ...alta, actorEmail: guard.user.email });
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    if (e instanceof SolicitudRepetida) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof ProyectoDeOtroCliente) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
