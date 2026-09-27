import { NextRequest, NextResponse } from "next/server";
import { guardProjectGenerateHandoff } from "@/lib/auth/api-guards";
import { vetoSiElHandoffEsDeOtro } from "@/lib/handoff/duenio";
import { generarResumenDeHandoff } from "@/lib/handoff/resumen";

type Params = { params: Promise<{ projectId: string }> };

/**
 * POST /api/projects/[projectId]/handoff/resumen
 *
 * LA PUERTA MANUAL del resumen del handoff — «¿qué se vendió?» en tres frases.
 *
 * Existe para lo RETROACTIVO. De acá en adelante el resumen lo escribe sola cada corrida del
 * agente de handoff (`analyze/route.ts`); los ~75 handoffs que ya estaban generados el día que
 * esto se construyó no tienen forma de conseguirlo por ese camino, y regenerarlos entero solo
 * para eso cuesta una corrida completa del agente y pisa lo que el CSE haya editado a mano.
 *
 * ── EL PERMISO ───────────────────────────────────────────────────────────────
 * `guardProjectGenerateHandoff`, el MISMO que generar el handoff, y no el de editarlo: esto
 * gasta tokens contra el presupuesto de IA. Un permiso más laxo convertiría este botón en la vía
 * barata para disparar el modelo sin la celda que lo gobierna.
 *
 * ⚠ Y el veto del hermano: si el handoff es de otro proyecto, su resumen se escribe allá. Sin
 * esto, dos proyectos escribirían resúmenes distintos del mismo documento.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardProjectGenerateHandoff(projectId);
  if (guard instanceof NextResponse) return guard;
  const veto = await vetoSiElHandoffEsDeOtro(projectId);
  if (veto) return veto;

  const r = await generarResumenDeHandoff(projectId);
  if (r.status === "sin_handoff") {
    return NextResponse.json(
      { error: "Este proyecto todavía no tiene handoff generado: no hay nada que resumir." },
      { status: 409 },
    );
  }
  if (r.status === "error") {
    return NextResponse.json({ error: `No se pudo escribir el resumen: ${r.error}` }, { status: 502 });
  }
  return NextResponse.json({ resumen: r.resumen });
}
