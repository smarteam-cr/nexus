/**
 * POST /api/sales/exploraciones/[id]/casos/mejorar   body: { useCaseId, instruccion }
 *   «Mejorar con IA» de las actividades de un caso ELEGIDO de la preventa (lib/exploraciones/mejorar-actividades.ts): el
 *   agente aplica la instrucción del CSE a la lista de actividades y sugiere aparte lo que queda por fuera. Responde con
 *   la propuesta cuando termina (unos 15-30 s); NO guarda nada: el CSE la aplica o la descarta en la pantalla. Pide
 *   `preventa.write` (gasta IA).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { MAX_LARGO_DE_LA_INSTRUCCION } from "@/lib/casos-de-uso/mejorar";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { mejorarActividades } from "@/lib/exploraciones/mejorar-actividades";

type Ctx = { params: Promise<{ id: string }> };

const Cuerpo = z.object({ useCaseId: z.string().min(1).max(60), instruccion: z.string().trim().min(3).max(MAX_LARGO_DE_LA_INSTRUCCION) });

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  if (guard.projectId) return NextResponse.json({ error: "La exploración de un proyecto no arma casos de uso." }, { status: 409 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const cuerpo = Cuerpo.safeParse(raw);
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);

  const r = await mejorarActividades({ exploracionId: id, useCaseId: cuerpo.data.useCaseId, instruccion: cuerpo.data.instruccion, email: guard.email });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ propuesta: r.propuesta, segundos: r.segundos });
}
