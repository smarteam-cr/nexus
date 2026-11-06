/**
 * POST /api/sales/exploraciones/[id]/despues   body: { sesionId, reunion }
 *   Después de una sesión (2026-11-06, punto 15): Nexus propone el desafío principal, lo que falta para confirmarlo y de 3
 *   a 5 temas por retomar, desde lo que leyó de su reunión (lib/exploraciones/despues-server.ts). Gasta IA y no guarda
 *   nada: la pantalla lo muestra y la persona lo confirma.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { proponerLoQueDejo } from "@/lib/exploraciones/despues-server";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";

type Ctx = { params: Promise<{ id: string }> };

const Cuerpo = z.object({
  sesionId: z.string().regex(/^s-[a-z0-9]{1,24}$/),
  reunion: z.string().regex(/^(meet|hubspot|documento):.{1,200}$/),
});

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
  const cuerpo = Cuerpo.safeParse(raw);
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  const r = await proponerLoQueDejo({ exploracionId: id, ...cuerpo.data, email: guard.email });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ desafio: r.desafio, retomar: r.retomar });
}
