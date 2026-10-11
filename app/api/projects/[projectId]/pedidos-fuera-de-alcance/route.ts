/**
 * /api/projects/[projectId]/pedidos-fuera-de-alcance — las solicitudes fuera de alcance de UN proyecto
 * (2026-10-02; seguimiento desde el 2026-10-07, lib/sessions/solicitudes-fuera-de-alcance.ts).
 *
 *   GET   → la lista del proyecto (lo que pide decisión primero)
 *   PATCH → { id, estado?, nota? }: el mismo cambio que en La cuenta › Fuera de alcance. Al confirmarla
 *           avisa a la líder de Customer Success y al vendedor.
 *
 * Interno: nada de esto cruza a un documento del cliente. Ventas ve las confirmadas en /sales › Oportunidades.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { leerCambio } from "@/lib/sessions/solicitudes-fuera-de-alcance";
import { cambiarSolicitud, SolicitudNoEncontrada, solicitudesDelCliente } from "@/lib/sessions/solicitudes-server";

type Params = Promise<{ projectId: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ pedidos: await solicitudesDelCliente(guard.clientId, { projectId }) });
}

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : null;
  // Desde el proyecto no se mueve a otro proyecto: eso se hace en La cuenta.
  const cambio = leerCambio(body ? { estado: body.estado, nota: body.nota } : null);
  if (!id || !cambio) return NextResponse.json({ error: "Falta la solicitud o el cambio." }, { status: 400 });
  try {
    return NextResponse.json(
      await cambiarSolicitud({ clientId: guard.clientId, id, cambio, actorEmail: guard.user.email, projectId }),
    );
  } catch (e) {
    if (e instanceof SolicitudNoEncontrada) return NextResponse.json({ error: "Esa solicitud no es de este proyecto." }, { status: 404 });
    throw e;
  }
}
