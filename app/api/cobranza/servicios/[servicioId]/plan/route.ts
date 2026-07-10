/**
 * /api/cobranza/servicios/[servicioId]/plan — el plan de pago activo.
 *   PUT → reemplaza el plan activo (transaccional: desactiva el previo + crea el
 *         nuevo con sus cuotas). Los cobros NO se regeneran acá — eso es
 *         /generar, explícito y aparte (la persona decide cuándo).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { setPlanActivo, CobranzaError } from "@/lib/cobranza/mutations";
import { planPutSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ servicioId: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { servicioId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = planPutSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    const plan = await setPlanActivo(servicioId, parsed.data);
    return NextResponse.json({ plan: { id: plan.id } });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
