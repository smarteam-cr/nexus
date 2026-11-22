/**
 * GET /api/sales/exploraciones/[id]/escala/resumen/versiones — el historial de versiones del Resumen de La escala
 * (21 nov, lib/exploraciones/versiones-del-resumen-server.ts). Responde { versiones, firma }: `firma`, la huella del
 * Resumen de hoy, que la pantalla manda al usar una. Pide poder ver la exploración.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { historialDelResumen } from "@/lib/exploraciones/versiones-del-resumen-server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;
  const h = await historialDelResumen(id);
  if (!h) return NextResponse.json({ error: "Esa exploración no existe." }, { status: 404 });
  return NextResponse.json(h);
}
