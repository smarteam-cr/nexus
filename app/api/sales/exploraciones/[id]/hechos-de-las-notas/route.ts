/**
 * GET /api/sales/exploraciones/[id]/hechos-de-las-notas  → { hechos: { [notaClave]: HechoDeUnaNota[] } }
 *
 * Los hechos que dejó cada nota de «Lo que sabes del cliente» de esta preventa (21 nov): qué, quién lo dijo y cuándo,
 * para verlos debajo de su nota. Lee SOLO los de esta preventa y su cliente (lib/exploraciones/hechos-de-las-notas-server.ts).
 * Internos: los ve quien puede leer la preventa, como las notas.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { hechosDeLasNotas } from "@/lib/exploraciones/hechos-de-las-notas-server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;
  // Solo la preventa: la exploración de un proyecto no guarda notas desde «Hablar con Nexus».
  if (guard.projectId) return NextResponse.json({ hechos: {} });
  return NextResponse.json({ hechos: await hechosDeLasNotas(id) });
}
