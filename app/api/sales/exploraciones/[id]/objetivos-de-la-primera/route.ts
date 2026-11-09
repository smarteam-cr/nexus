/**
 * POST /api/sales/exploraciones/[id]/objetivos-de-la-primera
 *
 * Los tres objetivos sugeridos de la PRIMERA sesión (2026-11-08, lib/exploraciones/objetivos-de-la-primera.ts): la primera
 * no tiene una sesión anterior que los sugiera. Se piden una vez por preventa al abrir su Preparación y quedan guardados.
 * Pide lo mismo que cambiar la exploración (lib/exploraciones/guardia.ts): gasta IA.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { ErrorDeLosObjetivos, objetivosDeLaPrimera } from "@/lib/exploraciones/objetivos-de-la-primera-server";
import { PresupuestoDeIaAgotado } from "@/lib/ai/presupuesto";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  try {
    return NextResponse.json({ objetivos: await objetivosDeLaPrimera(id, guard.email) });
  } catch (e) {
    if (e instanceof ErrorDeLosObjetivos) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof PresupuestoDeIaAgotado) return NextResponse.json({ error: "Nexus ya usó el presupuesto de IA de hoy. Mañana sigues." }, { status: 429 });
    console.error("[exploraciones] objetivos de la primera sesión:", e);
    return NextResponse.json({ error: "No se pudieron sugerir los objetivos. Escribe el tuyo." }, { status: 502 });
  }
}
