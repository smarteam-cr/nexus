/**
 * GET /api/sales/exploraciones/[id]/escala/areas/[areaId]/versiones — el historial de versiones de la página de un área de
 * La escala (23 nov, lib/exploraciones/versiones-del-area-server.ts). Responde { versiones, firma }: `firma`, la huella de
 * lo escrito hoy en esa página, que la pantalla manda al usar una. Pide poder ver la exploración.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { historialDelArea } from "@/lib/exploraciones/versiones-del-area-server";

type Ctx = { params: Promise<{ id: string; areaId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id, areaId } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;
  const h = await historialDelArea(id, areaId);
  if (!h) return NextResponse.json({ error: "Esa página no existe." }, { status: 404 });
  return NextResponse.json(h);
}
