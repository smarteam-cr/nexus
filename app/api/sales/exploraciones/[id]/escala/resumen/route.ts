/**
 * /api/sales/exploraciones/[id]/escala/resumen — «Armar el Resumen» / «Rehacer con IA» de la escala que ve el cliente
 * (lib/exploraciones/resumen-de-la-escala.ts, 2026-11-09). En la cuenta y en la preventa; la exploración de un proyecto
 * no se comparte (409).
 *
 *   POST → arranca la corrida y responde enseguida (202 { corrida }): el agente lee las reuniones de las sesiones y arma el
 *          Resumen en segundo plano (unos 3 minutos), después de responder (`after`). Hasta el 24 nov la respuesta esperaba
 *          al agente: una llamada a la IA que colgó 904 s dejó al navegador con un 504 de nginx (corta a los 600 s). Si ya
 *          hay una corrida viva, 409 { error, corrida }: la pantalla sigue esa. Lo escrito a mano se queda; el de antes y el
 *          nuevo quedan en el historial de versiones (./versiones). Pide poder cambiar la exploración.
 *   GET  → { corrida, terminada }: la última corrida del Resumen (RUNNING con su fase, DONE con lo descartado y los
 *          segundos, ERROR con el motivo en palabras simples), para seguirla, y la última que terminó bien (desde cuándo
 *          leyó el Resumen que hay). Pide poder leerla.
 * Los textos se editan con la operación `resumenDeLaEscala` del PATCH de la exploración (lib/exploraciones/guardia.ts).
 */
import { after, NextRequest, NextResponse } from "next/server";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { lanzarElResumenDeLaEscala, ultimaCorridaDelResumen, ultimaTerminadaDelResumen } from "@/lib/exploraciones/resumen-de-la-escala-server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  const r = await lanzarElResumenDeLaEscala({ exploracionId: id, email: guard.email });
  if (!r.ok) return NextResponse.json({ error: r.error, ...(r.corrida ? { corrida: r.corrida } : {}) }, { status: r.status });
  after(r.seguir);
  return NextResponse.json({ corrida: r.corrida }, { status: 202 });
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;
  const [corrida, terminada] = await Promise.all([ultimaCorridaDelResumen(id), ultimaTerminadaDelResumen(id)]);
  return NextResponse.json({ corrida, terminada });
}
