import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { canvasOfNested } from "@/lib/pieces/canvas-query";
import { SENTINEL_SERVICE_TYPE } from "@/lib/projects/kind";
import { hechosParaCitar } from "@/lib/procesos/agente";
import { esMapaDeCarriles } from "@/lib/procesos/mapa";

/**
 * GET /api/clients/[id]/procesos/[blockId]/hechos — lo que se dijo en las reuniones del cliente sobre
 * este proceso, para sumarlo como cita a un paso desde el editor. Sale de las lecturas que ya hizo el
 * agente (no llama al modelo). Si el mapa no sabe qué nombres tuvo en las lecturas (mapas de antes del
 * 2026-10-07), devuelve los hechos de todas las reuniones del cliente y lo dice.
 */
type Params = { params: Promise<{ id: string; blockId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id, blockId } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;
  const b = await prisma.canvasBlock.findFirst({
    where: { id: blockId, section: { key: "procesos", canvas: canvasOfNested("client-info", { project: { clientId: id, serviceType: SENTINEL_SERVICE_TYPE } }) } },
    select: { data: true },
  });
  const mapa: unknown = b?.data;
  if (!esMapaDeCarriles(mapa)) return NextResponse.json({ error: "Ese mapa no existe." }, { status: 404 });
  const incluye = mapa.incluye?.length ? mapa.incluye : undefined;
  return NextResponse.json({ hechos: await hechosParaCitar(id, incluye), delProceso: !!incluye });
}
