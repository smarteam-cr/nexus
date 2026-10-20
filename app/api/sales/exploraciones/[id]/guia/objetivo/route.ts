/**
 * POST /api/sales/exploraciones/[id]/guia/objetivo
 *
 * Unas tres preguntas nuevas para el objetivo de la próxima sesión (CEMACO, 2026-10-20): la pantalla las pide al guardar
 * el objetivo y cuando la persona las vuelve a pedir. El objetivo se lee de la sesión guardada, no del navegador. Quedan
 * como propuestas en los ajustes de la sesión (lib/exploraciones/guia-ajustes-server.ts › `proponerPreguntasDelObjetivo`):
 * se usan (entran a la guía como preguntas propias) o se descartan (no vuelven para ese objetivo).
 * Pide lo mismo que cambiar la exploración (lib/exploraciones/guardia.ts): gasta IA.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { ErrorDeLaGuia, proponerPreguntasDelObjetivo } from "@/lib/exploraciones/guia-ajustes-server";
import { paraLaPantalla } from "@/lib/exploraciones/servidor";
import { PresupuestoDeIaAgotado } from "@/lib/ai/presupuesto";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;

  try {
    const fila = await proponerPreguntasDelObjetivo(id, guard.email);
    return NextResponse.json({ exploracion: paraLaPantalla(fila) });
  } catch (e) {
    if (e instanceof ErrorDeLaGuia) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof PresupuestoDeIaAgotado) return NextResponse.json({ error: "Nexus ya usó el presupuesto de IA de hoy. Mañana sigues." }, { status: 429 });
    console.error("[exploraciones] preguntas para el objetivo:", e);
    return NextResponse.json({ error: "No se pudieron proponer preguntas para el objetivo. Prueba de nuevo." }, { status: 502 });
  }
}
