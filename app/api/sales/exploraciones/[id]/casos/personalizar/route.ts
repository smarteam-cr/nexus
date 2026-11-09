/**
 * POST /api/sales/exploraciones/[id]/casos/personalizar   body: { useCaseId }
 *   Personaliza un caso de uso ACEPTADO de la preventa (lib/exploraciones/personalizar-caso.ts): el agente revisa el
 *   contexto de la empresa (con las reuniones del chokepoint de sesiones), la biblioteca de actividades y la ficha del
 *   caso, y deja la versión personalizada como propuesta del caso. Responde cuando termina (unos 20-40 s), con la versión
 *   y si se usa sola (nadie tocó el caso mientras tanto). Pide `preventa.write` (gasta IA).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { personalizarCaso } from "@/lib/exploraciones/personalizar-caso";

type Ctx = { params: Promise<{ id: string }> };

const Cuerpo = z.object({ useCaseId: z.string().min(1).max(60) });

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

  const r = await personalizarCaso({ exploracionId: id, useCaseId: cuerpo.data.useCaseId, email: guard.email });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ item: r.item, seUsaSola: r.seUsaSola, segundos: r.segundos });
}
