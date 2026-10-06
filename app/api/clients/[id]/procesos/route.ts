import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient, guardPermission } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { iniciarMapeo } from "@/lib/procesos/agente";
import { tieneContenidoDeProceso } from "@/lib/procesos/mapa";
import { leerProcesosDelCliente } from "@/lib/procesos/servidor";

/**
 * /api/clients/[id]/procesos — los mapas de procesos del cliente (lib/procesos).
 *
 * GET  → los mapas nuevos (hoy y después), el índice del agente, los mapas del formato anterior que
 *        siguen en pie y la última corrida del mapeo (la pantalla la consulta mientras corre).
 * POST → arranca el mapeo en segundo plano y devuelve la corrida (202). Pide la celda de procesos:
 *        `generate` la primera vez, `regenerate` si el cliente ya tiene procesos.
 */
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await leerProcesosDelCliente(id));
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const bloques = await prisma.canvasBlock.findMany({
    where: { blockType: "FLOWCHART", section: { key: "procesos", canvas: canvasOfNested("client-info", { project: { clientId: id, serviceType: SENTINEL_SERVICE_TYPE } }) } },
    select: { data: true },
  });
  const permiso = await guardPermission("procesos", bloques.some((b) => tieneContenidoDeProceso(b.data)) ? "regenerate" : "generate");
  if (permiso instanceof NextResponse) return permiso;
  const corrida = await iniciarMapeo(id, guard.user.email ?? null);
  return NextResponse.json(corrida, { status: 202 });
}
