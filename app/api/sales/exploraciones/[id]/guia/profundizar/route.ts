/**
 * POST /api/sales/exploraciones/[id]/guia/profundizar   body: { sesionId, en, bloques }
 *
 * «Para profundizar» a pedido (2026-11-08): la guía sale sin esas preguntas y, al abrir el plegable de un bloque (o al
 * entrar a «En vivo», donde salen abiertas), se piden solo las de esos bloques y quedan guardadas en la guía
 * (lib/exploraciones/profundizar-server.ts). `en` dice cuál guía tiene enfrente el vendedor: si ya hay otra, 409.
 * Pide lo mismo que cambiar la exploración (lib/exploraciones/guardia.ts): gasta IA.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { MAX_BLOQUES } from "@/lib/exploraciones/agenda";
import { ErrorDeProfundizar, profundizarBloques } from "@/lib/exploraciones/profundizar-server";
import { PresupuestoDeIaAgotado } from "@/lib/ai/presupuesto";

type Ctx = { params: Promise<{ id: string }> };

const Cuerpo = z.object({
  sesionId: z.string().min(1).max(80).nullable(),
  en: z.string().min(1).max(40),
  bloques: z.array(z.number().int().min(0).max(MAX_BLOQUES)).min(1).max(MAX_BLOQUES + 1),
});

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;

  const cuerpo = Cuerpo.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);

  try {
    const preguntas = await profundizarBloques(id, { sesionId: cuerpo.data.sesionId, en: cuerpo.data.en, indices: cuerpo.data.bloques }, guard.email);
    return NextResponse.json({ preguntas });
  } catch (e) {
    if (e instanceof ErrorDeProfundizar) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof PresupuestoDeIaAgotado) return NextResponse.json({ error: "Nexus ya usó el presupuesto de IA de hoy. Mañana sigues." }, { status: 429 });
    console.error("[exploraciones] para profundizar:", e);
    return NextResponse.json({ error: "No se pudieron pensar las preguntas. Prueba de nuevo." }, { status: 502 });
  }
}
