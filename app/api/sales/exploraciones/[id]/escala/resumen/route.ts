/**
 * /api/sales/exploraciones/[id]/escala/resumen — «Armar el Resumen» / «Rehacer con IA» de la escala que ve el cliente
 * (lib/exploraciones/resumen-de-la-escala.ts, 2026-11-09). En la cuenta y en la preventa; la exploración de un proyecto
 * no se comparte (409).
 *
 *   POST → el agente lee las reuniones de las sesiones y arma el Resumen (unos 30-60 s). Lo escrito a mano se queda.
 *          Responde { resumen, descartados, segundos }: `descartados`, lo que escribió y no pasó la verificación (una
 *          cifra sin su cita, por ejemplo).
 * Los textos se editan con la operación `resumenDeLaEscala` del PATCH de la exploración. Armar pide poder cambiarla
 * (lib/exploraciones/guardia.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { generarElResumenDeLaEscala } from "@/lib/exploraciones/resumen-de-la-escala-server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  const r = await generarElResumenDeLaEscala({ exploracionId: id, email: guard.email });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ resumen: r.resumen, descartados: r.descartados, segundos: r.segundos });
}
