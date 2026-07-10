/**
 * /api/cobranza/servicios/[servicioId] — edición/baja de un servicio.
 *   PATCH  → editar campos del servicio.
 *   DELETE → borrar SOLO si no tiene cobros COBRADO (409 si no — marcá FINALIZADO).
 */
import { NextRequest, NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { updateServicio, deleteServicio, CobranzaError } from "@/lib/cobranza/mutations";
import { servicioPatchSchema } from "@/lib/cobranza/schema";

type Params = { params: Promise<{ servicioId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { servicioId } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = servicioPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input inválido" },
      { status: 400 },
    );
  }

  try {
    await updateServicio(servicioId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "El servicio no existe" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const { servicioId } = await params;
  try {
    await deleteServicio(servicioId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CobranzaError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "El servicio no existe" }, { status: 404 });
  }
}
