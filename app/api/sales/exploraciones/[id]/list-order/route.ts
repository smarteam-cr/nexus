/**
 * POST /api/sales/exploraciones/[id]/list-order   body: { clave: "metas" | "planes" | "retos" | … }
 *
 * «La IA propone, tú ordenas» (22 nov, noche; lib/exploraciones/orden-de-las-listas.ts): Nexus lee lo GUARDADO de esa
 * casilla y sugiere qué puntos juntar y cuáles subir a los primeros 4. Responde { sugerencias } y no guarda nada: la
 * persona las usa o las descarta en la lista y después guarda la casilla. Pide poder cambiar la exploración
 * (lib/exploraciones/guardia.ts). Corre solo cuando la persona lo pide.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { CASILLAS_CON_ORDEN } from "@/lib/exploraciones/orden-de-las-listas";
import { sugerirOrdenDeLaLista } from "@/lib/exploraciones/orden-de-las-listas-server";

type Ctx = { params: Promise<{ id: string }> };

const Cuerpo = z.object({ clave: z.enum(CASILLAS_CON_ORDEN) });

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const b = Cuerpo.safeParse(raw);
  if (!b.success) return cuerpoInvalido(b.error);
  const r = await sugerirOrdenDeLaLista({ exploracionId: id, clave: b.data.clave, email: guard.email });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ sugerencias: r.sugerencias });
}
