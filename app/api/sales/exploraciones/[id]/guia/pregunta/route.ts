/**
 * POST /api/sales/exploraciones/[id]/guia/pregunta   body: { clave }
 *
 * «Regenerar» UNA pregunta de la guía de la próxima sesión (validación 69, 2026-10-18): otra del mismo tema y el mismo
 * paso, sin rearmar la guía (lib/exploraciones/guia-ajustes-server.ts). Queda como un cambio de la sesión, con la marca
 * «regenerada»: sobrevive a «Actualizar la guía» y se devuelve a la de la guía con «Volver a la de la guía».
 * Pide lo mismo que cambiar la exploración (lib/exploraciones/guardia.ts): gasta IA.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { ErrorDeLaGuia, regenerarPregunta } from "@/lib/exploraciones/guia-ajustes-server";
import { paraLaPantalla } from "@/lib/exploraciones/servidor";
import { LARGO_DE_UNA_CLAVE } from "@/lib/exploraciones/ajustes-de-la-guia";
import { PresupuestoDeIaAgotado } from "@/lib/ai/presupuesto";

type Ctx = { params: Promise<{ id: string }> };

const Cuerpo = z.object({ clave: z.string().min(1).max(LARGO_DE_UNA_CLAVE) });

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;

  const cuerpo = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);

  try {
    const fila = await regenerarPregunta(id, cuerpo.data.clave, guard.email);
    return NextResponse.json({ exploracion: paraLaPantalla(fila) });
  } catch (e) {
    if (e instanceof ErrorDeLaGuia) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof PresupuestoDeIaAgotado) return NextResponse.json({ error: "Nexus ya usó el presupuesto de IA de hoy. Mañana sigues." }, { status: 429 });
    console.error("[exploraciones] regenerar una pregunta:", e);
    return NextResponse.json({ error: "No se pudo regenerar la pregunta. Prueba de nuevo." }, { status: 502 });
  }
}
