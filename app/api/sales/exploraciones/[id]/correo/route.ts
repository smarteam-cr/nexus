/**
 * POST /api/sales/exploraciones/[id]/correo   body: { reunion: { origen, id }, sesionId? }
 *   Arma con el agente el correo de seguimiento de una reunión de la exploración (qué entendimos, lo
 *   acordado, lo que quedó abierto y la próxima reunión) y lo guarda en el lienzo. Lo revisa y lo manda
 *   una persona: Nexus no envía nada. Pide lo mismo que correr el agente de la exploración (gasta IA).
 *   Síncrono: tarda unos segundos.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { armarCorreoDeSeguimiento } from "@/lib/exploraciones/correo-de-seguimiento-server";

type Ctx = { params: Promise<{ id: string }> };

const Cuerpo = z.object({
  // Hasta 200: los ids de una instancia de una serie de Meet llegan a ~190 (etapa A).
  reunion: z.object({ origen: z.enum(["meet", "hubspot", "documento"]), id: z.string().min(1).max(200) }),
  sesionId: z.string().min(1).max(60).nullable().optional(),
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

  const r = await armarCorreoDeSeguimiento({
    exploracionId: id,
    reunion: cuerpo.data.reunion,
    sesionId: cuerpo.data.sesionId ?? null,
    email: guard.email,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ clave: r.clave, correo: r.correo });
}
