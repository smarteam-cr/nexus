import { NextRequest, NextResponse } from "next/server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { leerFicha } from "@/lib/clients/ficha";
import { actualizarFichaConIA } from "@/lib/clients/ficha-propuesta";

/**
 * POST /api/clients/[id]/ficha/proponer — «Actualizar con IA».
 *
 * Lee handoffs, encuestas y las últimas sesiones del cliente y deja la PROPUESTA en la ficha (no
 * confirma ni escribe en HubSpot). Espera la respuesta: es una sola llamada a Claude y la pantalla
 * muestra el resultado apenas vuelve. Solo equipo interno (guardAccessToClient).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardAccessToClient(id);
  if (guard instanceof NextResponse) return guard;

  const r = await actualizarFichaConIA(id, guard.user.email);
  if (r.status === "error") {
    return NextResponse.json({ error: `No se pudo actualizar la ficha: ${r.error}` }, { status: 502 });
  }
  const client = await prisma.client.findUnique({ where: { id }, select: { ficha: true } });
  return NextResponse.json({
    ficha: leerFicha(client?.ficha),
    sinFuentes: r.status === "sin_fuentes",
    cambiados: r.status === "ok" ? r.cambiados : 0,
  });
}
